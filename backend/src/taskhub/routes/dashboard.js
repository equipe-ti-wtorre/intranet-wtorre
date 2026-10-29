const router = require('express').Router();
const { query } = require('../db');
const { ah, intParam, HttpError } = require('../lib/http');
const { TASK_SELECT, STATUS_CATEGORY_SQL, formatTask, DAY_REF_MIN } = require('../lib/tasks');
const { isoDate, addDays, weekStart } = require('../lib/dates');
const { oversees, overseesSector } = require('./teams');

// Painel de uma equipe ou de um setor inteiro: mesma lógica, muda o grupo de pessoas.
const GROUPS = {
  team: { people: 'SELECT user_id FROM team_members WHERE team_id = $2', table: 'teams', check: oversees, label: 'equipe' },
  sector: { people: 'SELECT id FROM users WHERE sector_id = $2 AND active IS DISTINCT FROM false', table: 'sectors', check: overseesSector, label: 'setor' },
};

const OPEN = `${STATUS_CATEGORY_SQL} IN ('todo','doing','blocked')`;

// O MariaDB devolve SUM/AVG como texto ("0"); o painel precisa de números.
const KPI_FIELDS = ['open', 'doing', 'blocked', 'overdue', 'done_week', 'done_prev_week', 'created_week', 'done_with_due_30d', 'on_time_30d'];
const PEOPLE_FIELDS = ['open', 'doing', 'blocked', 'overdue', 'done_7d', 'load_week_min', 'hidden_load_min', 'other_teams'];
const numbers = (row, fields) => Object.fromEntries(fields.map(f => [f, Number(row?.[f]) || 0]));

// Painel da equipe: o trabalho profissional das pessoas da equipe. O espaço pessoal nunca entra.
router.get('/:kind(team|sector)/:id', ah(async (req, res) => {
  const G = GROUPS[req.params.kind];
  const teamId = intParam(req.params.id);
  const me = req.user.id;
  if (!(await G.check(req.user, teamId))) throw new HttpError(403, `Você não acompanha este ${G.label}.`);

  const { rows: [team] } = await query(`SELECT id, name, color FROM ${G.table} WHERE id = $1`, [teamId]);
  if (!team) throw new HttpError(404, 'Não encontrado');

  const today = isoDate();
  const week0 = weekStart(today);
  const prevWeek0 = addDays(week0, -7);
  const in7 = addDays(today, 7);
  // Só o espaço profissional entra no painel; o pessoal é de cada um.
  const ofTeam = `t.assignee_id IN (${G.people})
    AND (p.id IS NULL OR p.archived = false) AND COALESCE(p.space, t.space) = 'profissional'`;
  const visible = `th_task_access($1, t.id) IS NOT NULL`;

  const { rows: [k] } = await query(
    `SELECT
       COUNT(*) FILTER (WHERE ${OPEN}) AS open,
       COUNT(*) FILTER (WHERE ws.category = 'doing') AS doing,
       COUNT(*) FILTER (WHERE ${STATUS_CATEGORY_SQL} = 'blocked') AS blocked,
       COUNT(*) FILTER (WHERE ${OPEN} AND t.deadline < $3) AS overdue,
       COUNT(*) FILTER (WHERE t.completed_at >= $4::date) AS done_week,
       COUNT(*) FILTER (WHERE t.completed_at >= $5::date AND t.completed_at < $4::date) AS done_prev_week,
       COUNT(*) FILTER (WHERE t.created_at >= $4::date) AS created_week,
       COUNT(*) FILTER (WHERE t.deadline IS NOT NULL AND t.completed_at > NOW() - INTERVAL '30 days') AS done_with_due_30d,
       COUNT(*) FILTER (WHERE t.deadline IS NOT NULL AND t.completed_at > NOW() - INTERVAL '30 days'
                        AND t.completed_at::date <= t.deadline) AS on_time_30d,
       AVG(EXTRACT(EPOCH FROM (t.completed_at - t.created_at)) / 86400)
         FILTER (WHERE t.completed_at > NOW() - INTERVAL '30 days') AS lead_time_days
     FROM tasks t LEFT JOIN projects p ON p.id = t.project_id LEFT JOIN workflow_statuses ws ON ws.id = t.status_id
     WHERE ${ofTeam} AND ${visible}`,
    [me, teamId, today, week0, prevWeek0]
  );

  const { rows: people } = await query(
    `SELECT u.id, u.name, u.initials, u.color, u.job_title, u.daily_capacity_min, u.away_until,
       (EXISTS (SELECT 1 FROM team_managers x WHERE x.user_id = u.id) OR EXISTS (SELECT 1 FROM sector_managers x WHERE x.user_id = u.id)) AS is_manager,
       COUNT(t.id) FILTER (WHERE ${OPEN} AND ${visible}) AS open,
       COUNT(t.id) FILTER (WHERE ws.category = 'doing' AND ${visible}) AS doing,
       COUNT(t.id) FILTER (WHERE ${STATUS_CATEGORY_SQL} = 'blocked' AND ${visible}) AS blocked,
       COUNT(t.id) FILTER (WHERE ${OPEN} AND t.deadline < $3 AND ${visible}) AS overdue,
       COUNT(t.id) FILTER (WHERE t.completed_at > NOW() - INTERVAL '7 days' AND ${visible}) AS done_7d,
       COALESCE(SUM(COALESCE(t.estimate_min, 30)) FILTER (WHERE t.id IS NOT NULL AND ${OPEN} AND (t.deadline IS NULL OR t.deadline <= $4)), 0) AS load_week_min,
       COALESCE(SUM(COALESCE(t.estimate_min, 30)) FILTER (WHERE t.id IS NOT NULL AND ${OPEN} AND (t.deadline IS NULL OR t.deadline <= $4)
                                                          AND NOT (${visible})), 0) AS hidden_load_min,
       COUNT(t.id) FILTER (WHERE ${OPEN} AND p.owner_id IS NOT NULL AND p.owner_id NOT IN (${G.people}) AND ${visible}) AS other_teams
     FROM users u
     LEFT JOIN tasks t ON t.assignee_id = u.id
       AND COALESCE((SELECT space FROM projects px WHERE px.id = t.project_id), t.space) = 'profissional'
     LEFT JOIN projects p ON p.id = t.project_id
     LEFT JOIN workflow_statuses ws ON ws.id = t.status_id
     WHERE u.id IN (${G.people}) AND u.active IS DISTINCT FROM false AND $1::int IS NOT NULL AND (p.id IS NULL OR p.archived = false)
     GROUP BY u.id ORDER BY u.name`,
    [me, teamId, today, in7]
  );

  const list = async (extra, order, limit = 40, params = []) => {
    const { rows } = await query(
      `${TASK_SELECT} WHERE ${ofTeam} AND ${visible} AND ${extra} ORDER BY ${order} LIMIT ${limit}`,
      [me, teamId, ...params]
    );
    return rows.map(formatTask);
  };

  const blocked = await list(`${STATUS_CATEGORY_SQL} = 'blocked'`, 't.updated_at ASC');
  const { rows: blockedSince } = blocked.length ? await query(
    `SELECT task_id, MAX(created_at) AS since FROM task_activity
      WHERE type = 'status_changed' AND task_id = ANY($1) GROUP BY task_id`, [blocked.map(t => t.id)]
  ) : { rows: [] };
  const sinceMap = Object.fromEntries(blockedSince.map(r => [r.task_id, r.since]));

  res.json({
    team,
    generated_at: new Date(),
    kpis: {
      ...numbers(k, KPI_FIELDS),
      lead_time_days: k.lead_time_days == null ? null : Number(k.lead_time_days),
    },
    people: people.map(r => {
      const p = { ...r, ...numbers(r, PEOPLE_FIELDS) };
      return { ...p, capacity_week_min: DAY_REF_MIN * 5, load_pct: Math.round((p.load_week_min / (DAY_REF_MIN * 5)) * 100) };
    }),
    blocked: blocked.map(t => ({ ...t, blocked_since: sinceMap[t.id] || t.updated_at })),
    due_soon: await list(`${OPEN} AND t.deadline >= $3 AND t.deadline <= $4`, 't.deadline, t.priority', 40, [today, in7]),
    overdue: await list(`${OPEN} AND t.deadline < $3`, 't.deadline', 40, [today]),
    triage: await list(`${OPEN} AND t.deadline IS NULL`, 't.created_at DESC', 30),
    waiting_other: await waitingOther(me, teamId, G.people),
    teams: req.params.kind === 'sector' ? await sectorTeams(me, teamId, today) : undefined,
  });
}));

const OPEN_TK = `COALESCE(ws.category, CASE WHEN tk.completed_at IS NOT NULL THEN 'done' ELSE 'todo' END) IN ('todo','doing','blocked')`;
const TEAM_FIELDS = ['members_count', 'open', 'overdue'];

// Equipes do setor, com abertas e atrasadas visíveis para quem abre o painel.
async function sectorTeams(me, sectorId, today) {
  const canSee = `th_task_access($1, tk.id) IS NOT NULL`;
  const professional = `COALESCE(p.space, tk.space) = 'profissional' AND (p.id IS NULL OR p.archived = false)`;
  const { rows } = await query(
    `SELECT tm.id, tm.name, tm.color,
       (SELECT COUNT(*) FROM team_members m WHERE m.team_id = tm.id) AS members_count,
       COUNT(tk.id) FILTER (WHERE ${OPEN_TK} AND ${professional} AND ${canSee}) AS open,
       COUNT(tk.id) FILTER (WHERE ${OPEN_TK} AND ${professional} AND tk.deadline < $3 AND ${canSee}) AS overdue
     FROM teams tm
     LEFT JOIN team_members mem ON mem.team_id = tm.id
     LEFT JOIN tasks tk ON tk.assignee_id = mem.user_id
     LEFT JOIN projects p ON p.id = tk.project_id
     LEFT JOIN workflow_statuses ws ON ws.id = tk.status_id
     WHERE tm.sector_id = $2 AND tm.archived = false
     GROUP BY tm.id, tm.name, tm.color ORDER BY tm.name`,
    [me, sectorId, today]
  );
  return rows.map(r => ({ ...r, ...numbers(r, TEAM_FIELDS) }));
}

// Tarefas compartilhadas da equipe que dependem de alguém de outro setor numa etapa.
async function waitingOther(me, teamId, PEOPLE) {
  const { rows } = await query(
    `${TASK_SELECT}
      WHERE (t.assignee_id IN (${PEOPLE}) OR p.owner_id IN (${PEOPLE}))
        AND (p.id IS NULL OR p.archived = false) AND th_task_access($1, t.id) IS NOT NULL AND ${OPEN}
        AND COALESCE(p.space, t.space) = 'profissional'
        AND (
          (t.assignee_id IS NOT NULL AND t.assignee_id NOT IN (${PEOPLE}))
          OR EXISTS (SELECT 1 FROM subtasks s WHERE s.task_id = t.id AND NOT s.done AND s.assignee_id IS NOT NULL
                       AND s.assignee_id NOT IN (${PEOPLE}))
        )
      ORDER BY t.deadline NULLS LAST LIMIT 30`,
    [me, teamId]
  );
  const tasks = rows.map(formatTask);
  if (!tasks.length) return [];
  const { rows: who } = await query(
    `SELECT x.task_id, u.name, COALESCE((SELECT GROUP_CONCAT(tt.name ORDER BY tt.name SEPARATOR ', ')
              FROM team_members tm JOIN teams tt ON tt.id = tm.team_id WHERE tm.user_id = u.id), sc.name) AS team_name, x.step FROM (
        SELECT t.id AS task_id, t.assignee_id AS user_id, NULL AS step FROM tasks t WHERE t.id = ANY($1)
        UNION ALL
        SELECT s.task_id, s.assignee_id, s.title FROM subtasks s WHERE s.task_id = ANY($1) AND NOT s.done
      ) x
      JOIN users u ON u.id = x.user_id
      LEFT JOIN sectors sc ON sc.id = u.sector_id
      WHERE u.id NOT IN (${PEOPLE})`,
    [tasks.map(t => t.id), teamId]
  );
  return tasks.map(t => ({
    ...t,
    waiting_on: who.filter(w => w.task_id === t.id).map(w => ({ name: w.name, team: w.team_name || 'sem equipe', step: w.step })),
  }));
}

module.exports = router;
