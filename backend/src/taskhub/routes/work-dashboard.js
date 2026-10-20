const router = require('express').Router();
const { query } = require('../db');
const { ah, intParam, HttpError } = require('../lib/http');
const { isoDate, addDays } = require('../lib/dates');

// Dashboard do trabalho: a mesma base alimenta a aba Dashboard do trabalho, a apresentação
// dentro do sistema e o PowerPoint. Quem vê o trabalho vê o dashboard dele.
// Datas podem vir como Date (timestamp) ou texto (date): normaliza para AAAA-MM-DD.
const d10 = (v) => (v instanceof Date ? isoDate(v) : String(v).slice(0, 10));

const CAT = `COALESCE(ws.category, CASE WHEN t.completed_at IS NOT NULL THEN 'done' ELSE 'todo' END)`;

router.get('/works/:id/dashboard', ah(async (req, res) => {
  const me = req.user.id;
  const wid = intParam(req.params.id);
  const { rows: [w] } = await query(
    `SELECT s.id, s.name, s.color, s.description, s.due_date, s.completed_at, s.created_at, s.project_id,
            o.name AS owner_name, p.name AS project_name, p.color AS project_color, sc.name AS sector_name,
            th_work_role($1, s.id) AS my_role
       FROM project_sections s JOIN projects p ON p.id = s.project_id
       LEFT JOIN users o ON o.id = s.owner_id
       LEFT JOIN teams tm ON tm.id = p.team_id
       LEFT JOIN sectors sc ON sc.id = tm.sector_id
      WHERE s.id = $2`, [me, wid]
  );
  if (!w || !w.my_role) throw new HttpError(404, 'Trabalho não encontrado');

  const today = isoDate();
  const in14 = addDays(today, 14);
  const { rows: tasks } = await query(
    `SELECT t.id, t.title, t.deadline, t.completed_at, t.created_at, t.blocked_reason, t.priority, t.size,
            ${CAT} AS category, ws.name AS status_name, ws.color AS status_color, ws.position AS status_pos,
            u.id AS user_id, u.name AS user_name, u.initials AS user_initials, u.color AS user_color
       FROM tasks t
       LEFT JOIN workflow_statuses ws ON ws.id = t.status_id
       LEFT JOIN users u ON u.id = t.assignee_id
      WHERE t.section_id = $1`, [wid]
  );

  const isOpen = (t) => ['todo', 'doing', 'blocked'].includes(t.category);
  const isDone = (t) => t.category === 'done';
  const open = tasks.filter(isOpen);
  const done = tasks.filter(isDone);
  const overdue = open.filter(t => t.deadline && d10(t.deadline) < today);
  const blocked = open.filter(t => t.category === 'blocked');
  const doneWeek = done.filter(t => t.completed_at && Date.now() - new Date(t.completed_at).getTime() < 7 * 864e5);
  const total = tasks.filter(t => t.category !== 'canceled').length;
  const pct = total ? Math.round((done.length / total) * 100) : 0;

  // Prazo de entrega: tempo decorrido × progresso (indica se o ritmo acompanha o calendário).
  const startDate = d10(w.created_at);
  const endDate = w.due_date ? d10(w.due_date) : null;
  let timePct = null;
  if (endDate && !w.completed_at) {
    const s = new Date(`${startDate}T00:00:00`).getTime(); const e = new Date(`${endDate}T23:59:59`).getTime();
    timePct = e > s ? Math.max(0, Math.min(100, Math.round(((Date.now() - s) / (e - s)) * 100))) : null;
  }
  // Saúde do trabalho: concluído; atrasado (prazo passou); em risco (tarefas atrasadas ou bloqueadas); no prazo.
  const health = w.completed_at ? 'concluido'
    : endDate && endDate < today ? 'atrasado'
    : overdue.length || blocked.length ? 'em_risco' : 'no_prazo';

  const doing = open.filter(t => t.category === 'doing');

  const statusMap = new Map();
  for (const t of tasks) {
    if (t.category === 'canceled') continue;
    const key = t.status_name || (isDone(t) ? 'Concluído' : 'A fazer');
    const cur = statusMap.get(key) || { name: key, color: t.status_color || '#94a3b8', category: t.category, position: t.status_pos ?? 99, count: 0 };
    cur.count++; statusMap.set(key, cur);
  }
  const byStatus = [...statusMap.values()].sort((a, b) => a.position - b.position);

  const people = new Map();
  for (const t of tasks) {
    if (!t.user_id || t.category === 'canceled') continue;
    const cur = people.get(t.user_id) || { id: t.user_id, name: t.user_name, initials: t.user_initials, color: t.user_color, open: 0, overdue: 0, done: 0 };
    if (isOpen(t)) cur.open++;
    if (isOpen(t) && t.deadline && d10(t.deadline) < today) cur.overdue++;
    if (isDone(t)) cur.done++;
    people.set(t.user_id, cur);
  }
  const byPerson = [...people.values()].sort((a, b) => b.open - a.open || a.name.localeCompare(b.name));

  // Últimas 8 semanas: tarefas criadas × concluídas.
  const weekly = [];
  const monday = (d) => { const x = new Date(`${d}T12:00:00`); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return isoDate(x); };
  const thisWeek = monday(today);
  for (let i = 7; i >= 0; i--) {
    const start = addDays(thisWeek, -7 * i); const end = addDays(start, 7);
    weekly.push({
      week: start,
      created: tasks.filter(t => { const c = d10(t.created_at); return c >= start && c < end; }).length,
      done: done.filter(t => { const c = t.completed_at && d10(t.completed_at); return c && c >= start && c < end; }).length,
    });
  }

  const item = (t) => ({
    id: t.id, title: t.title, status: t.status_name || null, status_color: t.status_color || null,
    due_date: t.deadline ? d10(t.deadline) : null, assignee: t.user_name || null,
    assignee_initials: t.user_initials, assignee_color: t.user_color, blocked_reason: t.blocked_reason || null,
    completed_at: t.completed_at,
  });
  const byDue = (a, b) => String(a.deadline).localeCompare(String(b.deadline));

  res.json({
    subject: {
      id: w.id, name: w.name, color: w.color, description: w.description, health,
      project_id: w.project_id, project_name: w.project_name, sector_name: w.sector_name, owner_name: w.owner_name,
      start_date: startDate, end_date: endDate, completed: !!w.completed_at,
    },
    generated_at: new Date(),
    kpis: {
      total, done: done.length, open: open.length, doing: doing.length, overdue: overdue.length, blocked: blocked.length,
      done_week: doneWeek.length, pct, time_pct: timePct,
    },
    by_status: byStatus,
    by_person: byPerson,
    weekly,
    doing: doing.sort(byDue).slice(0, 12).map(item),
    upcoming: open.filter(t => t.deadline && d10(t.deadline) >= today && d10(t.deadline) <= in14).sort(byDue).slice(0, 12).map(item),
    overdue: overdue.sort(byDue).slice(0, 12).map(item),
    blocked: blocked.slice(0, 12).map(item),
    done_week: doneWeek.sort((a, b) => String(b.completed_at).localeCompare(String(a.completed_at))).slice(0, 12).map(item),
  });
}));

module.exports = router;
