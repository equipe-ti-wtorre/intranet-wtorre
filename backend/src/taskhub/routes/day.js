const router = require('express').Router();
const { z } = require('zod');
const { query, tx } = require('../db');
const { ah, parse, intParam, HttpError } = require('../lib/http');
const { MINE_SQL, TASK_SELECT, STATUS_CATEGORY_SQL, formatTask, loadMin } = require('../lib/tasks');
const { isoDate, addDays, isIsoDate } = require('../lib/dates');

// Linha do dia: o plano é dividido em Manhã, Tarde e Fim do dia, sem horários.
// A carga de cada período usa o tamanho da tarefa (P/M/G) e a capacidade diária da pessoa.
const PERIODS = ['manha', 'tarde', 'fim'];
const PERIOD_SHARE = { manha: 0.45, tarde: 0.4, fim: 0.15 }; // fatia da capacidade em cada período

function dateParam(v) {
  const d = v || isoDate();
  if (!isIsoDate(d)) throw new HttpError(422, 'Data inválida (use AAAA-MM-DD)');
  return d;
}

// Horário de rotina e lembrete → período (sem mostrar a hora na tela).
const periodOfTime = (hhmm) => {
  const h = Number(String(hhmm || '09').slice(0, 2));
  return h < 12 ? 'manha' : h < 17 ? 'tarde' : 'fim';
};
const currentPeriod = () => periodOfTime(new Date().toTimeString().slice(0, 5));

// Nível de carga: leve (< 60% da capacidade), equilibrado (até 100%) ou cheio.
const level = (min, cap) => (min > cap ? 'cheio' : min >= cap * 0.6 ? 'equilibrado' : 'leve');

const OPEN = `${STATUS_CATEGORY_SQL} IN ('todo','doing','blocked')`;

// GET /api/v1/me/day?date=AAAA-MM-DD
router.get('/', ah(async (req, res) => {
  const me = req.user.id;
  const date = dateParam(req.query.date);
  const today = isoDate();
  const capacity = req.user.daily_capacity_min || 420;

  const { rows: planRows } = await query(
    `${TASK_SELECT} JOIN day_plan_items dp ON dp.task_id = t.id AND dp.user_id = $1 AND dp.plan_date = $2
      WHERE th_task_access($1, t.id) IS NOT NULL
      ORDER BY dp.position, dp.id`,
    [me, date]
  );
  const { rows: periodRows } = await query(
    'SELECT task_id, period FROM day_plan_items WHERE user_id = $1 AND plan_date = $2', [me, date]
  );
  const periodOf = Object.fromEntries(periodRows.map(r => [r.task_id, PERIODS.includes(r.period) ? r.period : 'manha']));
  const plan = planRows.map(r => ({ ...formatTask(r), period: periodOf[r.id] || 'manha' }));
  const planned = new Set(plan.map(t => t.id));

  // Sugestões (o que está comigo e ainda não foi para o plano).
  const { rows: openRows } = await query(
    `${TASK_SELECT}
      WHERE ${MINE_SQL('$1')} AND ${OPEN} AND th_task_access($1, t.id) IS NOT NULL
        AND (p.id IS NULL OR p.archived = false)
      ORDER BY t.deadline NULLS LAST,
               CASE t.priority WHEN 'critica' THEN 0 WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END, t.id`,
    [me]
  );
  const open = openRows.map(formatTask).filter(t => !planned.has(t.id));
  const { rows: carryRows } = await query(
    `SELECT DISTINCT dp.task_id FROM day_plan_items dp
       WHERE dp.user_id = $1 AND dp.plan_date < $2 AND dp.plan_date >= $3`,
    [me, date, addDays(date, -7)]
  );
  const carryIds = new Set(carryRows.map(r => r.task_id));
  const weekEnd = addDays(date, 7);
  const groups = { overdue: [], today: [], carryover: [], week: [], recent: [], backlog: [] };
  const recentLimit = Date.now() - 3 * 864e5;
  const dueOf = (t) => (t.assignee?.id === me ? t.due_date : (t.my_steps.map(s => s.due_date).filter(Boolean).sort()[0] || t.due_date));
  for (const t0 of open) {
    const t = { ...t0, due_date: dueOf(t0) };
    if (t.due_date && t.due_date < date) groups.overdue.push(t);
    else if (t.due_date === date) groups.today.push(t);
    else if (carryIds.has(t.id)) groups.carryover.push(t);
    else if (t.due_date && t.due_date <= weekEnd) groups.week.push(t);
    else if (new Date(t.created_at).getTime() > recentLimit && t.created_by?.id !== me) groups.recent.push(t);
    else groups.backlog.push(t);
  }
  groups.backlog = groups.backlog.slice(0, 30);

  // Rotina e lembretes do dia, encaixados no período pela hora cadastrada.
  const weekday = new Date(`${date}T12:00:00`).getDay();
  const { rows: routineRows } = await query(
    `SELECT b.id, b.label AS title, b.start_time,
            EXISTS (SELECT 1 FROM routine_checks c WHERE c.routine_block_id = b.id AND c.check_date = $3 AND c.done) AS done
       FROM routine_blocks b WHERE b.user_id = $1 AND b.weekday = $2 ORDER BY b.start_time, b.sort_order`,
    [me, weekday, date]
  );
  const routine = routineRows.map(r => ({ id: r.id, title: r.title, done: r.done, period: periodOfTime(r.start_time), time: String(r.start_time).slice(0, 5) }));
  const { rows: remRows } = await query(
    `SELECT id, title, reminder_time, done FROM reminders WHERE user_id = $1 AND reminder_date = $2 ORDER BY reminder_time`, [me, date]
  );
  const reminders = remRows.map(r => ({ id: r.id, title: r.title, done: r.done, period: periodOfTime(r.reminder_time), time: String(r.reminder_time).slice(0, 5) }));

  // Esperando: etapas que outras pessoas pediram a mim, e etapas que pedi a outras pessoas.
  const forMe = open.concat(plan).filter(t => t.assignee?.id !== me && t.my_steps.length)
    .map(t => ({ task_id: t.id, task: t.title, step: t.my_steps[0].title, from: t.created_by?.name || t.assignee?.name || null }));
  const { rows: byMe } = await query(
    `SELECT s.id, s.title AS step, t.id AS task_id, t.title AS task, u.name AS person, s.due_date,
            (CURRENT_DATE - t.updated_at::date) AS days
       FROM subtasks s JOIN tasks t ON t.id = s.task_id JOIN users u ON u.id = s.assignee_id
      WHERE NOT s.done AND s.assignee_id <> $1 AND (t.created_by = $1 OR t.assignee_id = $1)
      ORDER BY s.due_date NULLS LAST LIMIT 10`, [me]
  );

  // Carga por período.
  const periods = PERIODS.map(p => {
    const items = plan.filter(t => t.period === p);
    const openItems = items.filter(t => !['done', 'canceled'].includes(t.status.category));
    const min = openItems.reduce((s, t) => s + loadMin(t), 0);
    const doneTasks = items.length - openItems.length;
    const r = routine.filter(x => x.period === p); const m = reminders.filter(x => x.period === p);
    const total = items.length + r.length + m.length;
    const done = doneTasks + r.filter(x => x.done).length + m.filter(x => x.done).length;
    return { key: p, load: level(min, capacity * PERIOD_SHARE[p]), total, done };
  });

  // Amanhã: o que já está no plano e o que vence.
  const tomorrow = addDays(date, 1);
  const { rows: [tm] } = await query(
    `SELECT (SELECT COUNT(*) FROM day_plan_items WHERE user_id = $1 AND plan_date = $2)::int AS planned,
            (SELECT COUNT(*) FROM tasks t LEFT JOIN workflow_statuses ws ON ws.id = t.status_id
              WHERE ${MINE_SQL('$1')} AND t.deadline = $2 AND ${OPEN})::int AS due`, [me, tomorrow]
  );

  const { rows: [closure] } = await query(
    'SELECT summary, closed_at FROM day_closures WHERE user_id = $1 AND plan_date = $2', [me, date]
  );
  const openPlan = plan.filter(t => !['done', 'canceled'].includes(t.status.category));
  const planMin = openPlan.reduce((s, t) => s + loadMin(t), 0);

  res.json({
    date,
    current_period: date === today ? currentPeriod() : null,
    capacity_min: capacity,
    load: level(planMin, capacity),
    plan,
    periods,
    routine,
    reminders,
    suggestions: groups,
    counts: { overdue: groups.overdue.length, today: groups.today.length + plan.filter(t => t.due_date === date && !['done', 'canceled'].includes(t.status.category)).length, waiting_me: forMe.length },
    waiting: { for_me: forMe, by_me: byMe },
    tomorrow: { date: tomorrow, planned: tm.planned, due: tm.due },
    closure: closure || null,
    // Campos antigos mantidos para quem ainda usa a régua em minutos.
    planned_min: plan.reduce((s, t) => s + loadMin(t), 0),
    remaining_min: planMin,
  });
}));

const periodSchema = z.enum(['manha', 'tarde', 'fim']);

// Põe uma tarefa no plano (ou muda de período, se já estiver).
router.post('/items', ah(async (req, res) => {
  const me = req.user.id;
  const d = parse(z.object({ task_id: z.number().int().positive(), date: z.string().optional(), position: z.number().int().optional(), period: periodSchema.optional() }), req.body);
  const date = dateParam(d.date);
  const { rows } = await query('SELECT th_task_access($1, $2) AS a', [me, d.task_id]);
  if (!rows[0]?.a) throw new HttpError(404, 'Tarefa não encontrada');
  const period = d.period || (date === isoDate() ? currentPeriod() : 'manha');
  let position = d.position ?? null;
  if (position == null) {
    const { rows: [pos] } = await query(
      'SELECT COALESCE(MAX(position), 0) + 1 AS n FROM day_plan_items WHERE user_id = $1 AND plan_date = $2',
      [me, date]
    );
    position = pos.n;
  }
  await query(
    `INSERT INTO day_plan_items (user_id, plan_date, task_id, position, period)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id, plan_date, task_id) DO UPDATE SET period = EXCLUDED.period`,
    [me, date, d.task_id, position, period]
  );
  res.status(201).json({ ok: true, period });
}));

router.delete('/items/:taskId', ah(async (req, res) => {
  const date = dateParam(req.query.date);
  await query('DELETE FROM day_plan_items WHERE user_id = $1 AND plan_date = $2 AND task_id = $3',
    [req.user.id, date, intParam(req.params.taskId, 'taskId')]);
  res.json({ ok: true });
}));

// "Distribuir pelo dia": leva atrasadas, as de hoje e o que sobrou para o plano, encaixando
// as grandes de manhã, as médias à tarde e as pequenas onde couber, sem passar da capacidade.
router.post('/distribute', ah(async (req, res) => {
  const me = req.user.id;
  const date = dateParam(req.body?.date);
  const capacity = req.user.daily_capacity_min || 420;
  const { rows } = await query(
    `${TASK_SELECT}
      LEFT JOIN day_plan_items dp ON dp.task_id = t.id AND dp.user_id = $1 AND dp.plan_date = $2
      WHERE ${MINE_SQL('$1')} AND ${OPEN} AND th_task_access($1, t.id) IS NOT NULL AND dp.id IS NULL
        AND (p.id IS NULL OR p.archived = false)
        AND (t.deadline <= $2 OR t.id IN (SELECT task_id FROM day_plan_items WHERE user_id = $1 AND plan_date < $2 AND plan_date >= $3))
      ORDER BY t.deadline NULLS LAST, CASE t.priority WHEN 'critica' THEN 0 WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END`,
    [me, date, addDays(date, -7)]
  );
  const { rows: existing } = await query(
    `SELECT dp.period, t.size, t.estimate_min FROM day_plan_items dp JOIN tasks t ON t.id = dp.task_id
      WHERE dp.user_id = $1 AND dp.plan_date = $2 AND t.completed_at IS NULL`, [me, date]
  );
  const used = { manha: 0, tarde: 0, fim: 0 };
  for (const e of existing) used[PERIODS.includes(e.period) ? e.period : 'manha'] += loadMin(e);
  const cap = (p) => capacity * PERIOD_SHARE[p];
  const pref = { G: ['manha', 'tarde', 'fim'], M: ['tarde', 'manha', 'fim'], P: ['fim', 'tarde', 'manha'] };
  const added = [];
  await tx(async (c) => {
    for (const r of rows) {
      const t = formatTask(r);
      const m = loadMin(t);
      const order = pref[t.size || (m >= 180 ? 'G' : m >= 90 ? 'M' : 'P')];
      // Cabe se não passar da fatia do período; um período vazio sempre aceita uma tarefa.
      const p = order.find(x => used[x] + m <= cap(x) || used[x] === 0);
      if (!p) continue;
      used[p] += m;
      const { rows: [planPos] } = await c.query(
        'SELECT COALESCE(MAX(position), 0) + 1 AS n FROM day_plan_items WHERE user_id = $1 AND plan_date = $2',
        [me, date]
      );
      await c.query(
        `INSERT INTO day_plan_items (user_id, plan_date, task_id, position, period)
         VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`, [me, date, t.id, planPos.n, p]
      );
      added.push({ task_id: t.id, period: p });
    }
  });
  res.json({ added: added.length, items: added });
}));

// Encerramento do dia: decide o destino do que sobrou e guarda um resumo (só para a pessoa).
router.post('/close', ah(async (req, res) => {
  const me = req.user.id;
  const d = parse(z.object({
    date: z.string().optional(),
    actions: z.array(z.object({ task_id: z.number().int(), action: z.enum(['amanha', 'remover']) })).default([]),
    note: z.string().max(2000).default(''),
  }), req.body);
  const date = dateParam(d.date);
  const tomorrow = addDays(date, 1);

  const { rows } = await query(
    `${TASK_SELECT} JOIN day_plan_items dp ON dp.task_id = t.id AND dp.user_id = $1 AND dp.plan_date = $2
      ORDER BY dp.position`, [me, date]
  );
  const plan = rows.map(formatTask);
  const done = plan.filter(t => t.status.category === 'done');
  const moved = []; const dropped = [];

  const result = await tx(async (c) => {
    for (const a of d.actions) {
      const t = plan.find(p => p.id === a.task_id);
      if (!t) continue;
      if (a.action === 'amanha') {
        // O que sobra vai para a manhã do dia seguinte.
        const { rows: [planPos] } = await c.query(
          'SELECT COALESCE(MAX(position), 0) + 1 AS n FROM day_plan_items WHERE user_id = $1 AND plan_date = $2',
          [me, tomorrow]
        );
        await c.query(
          `INSERT INTO day_plan_items (user_id, plan_date, task_id, position, period)
           VALUES ($1, $2, $3, $4, 'manha') ON CONFLICT DO NOTHING`, [me, tomorrow, t.id, planPos.n]
        );
        moved.push(t);
      } else {
        dropped.push(t);
      }
    }
    const lines = [];
    lines.push(done.length ? `Concluí: ${done.map(t => t.title).join('; ')}.` : 'Nenhuma tarefa concluída hoje.');
    if (moved.length) lines.push(`Fica para amanhã: ${moved.map(t => t.title).join('; ')}.`);
    if (dropped.length) lines.push(`Voltou para a fila: ${dropped.map(t => t.title).join('; ')}.`);
    const blocked = plan.filter(t => t.status.category === 'blocked');
    if (blocked.length) lines.push(`Bloqueado: ${blocked.map(t => t.blocked_reason ? `${t.title} (${t.blocked_reason})` : t.title).join('; ')}.`);
    if (d.note.trim()) lines.push(d.note.trim());
    const summary = lines.join('\n');
    await c.query(
      `INSERT INTO day_closures (user_id, plan_date, summary) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, plan_date) DO UPDATE SET summary = EXCLUDED.summary, closed_at = NOW()`,
      [me, date, summary]
    );
    return { summary, done: done.length, moved: moved.length, dropped: dropped.length };
  });
  res.json(result);
}));

module.exports = router;
