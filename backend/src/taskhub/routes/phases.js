const router = require('express').Router();
const { z } = require('zod');
const { query, tx } = require('../db');
const { ah, parse, intParam, HttpError } = require('../lib/http');
const { has } = require('../lib/permissions');
const { teamPhases, projectPhases, ownPhases } = require('../lib/phases');
const { clampPhaseDays, sumPhaseDays, endAfter, nextBusiness, afterBusiness, businessDaysBetween, dayOf, sharesOwner, DEFAULT_DURATION } = require('../lib/timeline');
const { isoDate } = require('../lib/dates');
const { readDates, logDates, notifyDates } = require('../lib/work-dates');
const { oversees, overseesSector } = require('./teams');

// Fases da equipe: colunas do Kanban de projetos e de tarefas de tudo o que é da equipe.

const TEAM_WORKS = `SELECT s.id FROM project_sections s JOIN projects p ON p.id = s.project_id WHERE p.team_id = $1`;
const TEAM_TASKS = `SELECT tk.id FROM tasks tk JOIN projects p ON p.id = tk.project_id WHERE p.team_id = $1`;
const PROJECT_WORKS = `SELECT s.id FROM project_sections s WHERE s.project_id = $1`;
const PROJECT_TASKS = `SELECT tk.id FROM tasks tk WHERE tk.project_id = $1`;

async function loadTeam(id) {
  const { rows: [t] } = await query('SELECT id, sector_id FROM teams WHERE id = $1', [id]);
  if (!t) throw new HttpError(404, 'Equipe não encontrada');
  return t;
}

// Quem monta as fases: gestão da equipe, quem acompanha o setor e o administrador.
async function canEdit(user, teamId) {
  if (!teamId) return false;
  if (has(user, 'gerenciar_pessoas_todas')) return true;
  if (await oversees(user, teamId)) return true;
  const { rows: [t] } = await query('SELECT sector_id FROM teams WHERE id = $1', [teamId]);
  return !!(t?.sector_id && await overseesSector(user, t.sector_id));
}

async function canSee(user, teamId) {
  if (await canEdit(user, teamId)) return true;
  const { rows: [r] } = await query(
    `SELECT EXISTS (SELECT 1 FROM team_members WHERE team_id = $1 AND user_id = $2) AS ok`, [teamId, user.id]
  );
  return !!r.ok;
}

router.get('/teams/:id/phases', ah(async (req, res) => {
  const id = intParam(req.params.id);
  await loadTeam(id);
  if (!(await canSee(req.user, id))) throw new HttpError(404, 'Equipe não encontrada');
  const phases = await teamPhases({ query }, id);
  res.json({ phases, is_default: phases.every(p => p.team_id == null), can_edit: await canEdit(req.user, id) });
}));

const saveSchema = z.object({
  items: z.array(z.object({
    id: z.number().int().positive().optional(),
    name: z.string().trim().min(2, 'informe o nome da fase').max(60),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#8b93a1'),
    duration_days: z.coerce.number().int().min(0).max(365).optional(),
  })).min(1, 'mantenha pelo menos uma fase').max(20),
});

// Escopo da lista de fases: a equipe inteira ou um projeto sem equipe.
function teamScope(teamId) {
  return {
    lock: c => c.query('SELECT id FROM teams WHERE id = $1 FOR UPDATE', [teamId]),
    current: c => teamPhases(c, teamId),
    isOwn: async (c, list) => new Set(list.filter(p => p.team_id === teamId).map(p => p.id)),
    insert: (c, it, i, days) => c.query(
      'INSERT INTO team_phases (team_id, name, color, position, duration_days) VALUES ($1, $2, $3, $4, $5) RETURNING id', [teamId, it.name, it.color, i, days]
    ),
    works: TEAM_WORKS, tasks: TEAM_TASKS, key: teamId,
    changed: 'As fases da equipe mudaram. Recarregue e tente de novo.',
  };
}

function projectScope(projectId) {
  return {
    lock: c => c.query('SELECT id FROM projects WHERE id = $1 FOR UPDATE', [projectId]),
    current: c => projectPhases(c, projectId),
    isOwn: async c => new Set((await ownPhases(c, projectId)).map(p => p.id)),
    insert: async (c, it, i, days) => {
      const r = await c.query(
        'INSERT INTO team_phases (team_id, name, color, position, duration_days) VALUES (NULL, $1, $2, $3, $4) RETURNING id', [it.name, it.color, i, days]
      );
      await c.query('INSERT INTO project_phases (phase_id, project_id) VALUES ($1, $2)', [r.rows[0].id, projectId]);
      return r;
    },
    works: PROJECT_WORKS, tasks: PROJECT_TASKS, key: projectId,
    changed: 'As fases do projeto mudaram. Recarregue e tente de novo.',
  };
}

// Salva a lista inteira, na ordem enviada. Na primeira vez, o escopo ganha uma cópia própria da
// lista padrão e o que estava na padrão passa para a cópia (só dentro do escopo).
async function savePhaseList(scope, body) {
  const d = parse(saveSchema, body);
  const names = d.items.map(it => it.name.toLowerCase());
  if (new Set(names).size !== names.length) throw new HttpError(400, 'Há fases com o mesmo nome.');
  const inWorks = n => scope.works.replace('$1', `$${n}`);
  const inTasks = n => scope.tasks.replace('$1', `$${n}`);

  await tx(async (c) => {
    await scope.lock(c);
    const current = await scope.current(c);
    const own = await scope.isOwn(c, current);
    const byId = new Map(current.map(p => [p.id, p]));
    if (d.items.some(it => it.id && !byId.has(it.id))) throw new HttpError(409, scope.changed);
    const kept = new Set(d.items.filter(it => it.id).map(it => it.id));
    const removed = current.filter(p => !kept.has(p.id));
    for (const p of removed) {
      const { rows: [u] } = await c.query(
        `SELECT COUNT(*) AS n FROM work_phase WHERE phase_id = $1 AND work_id IN (${inWorks(2)})`, [p.id, scope.key]
      );
      if (Number(u.n) > 0) throw new HttpError(409, `Há projetos na fase "${p.name}". Mova-os antes de excluir.`);
    }

    for (const [i, it] of d.items.entries()) {
      const days = clampPhaseDays(it.duration_days ?? byId.get(it.id)?.duration_days ?? 5);
      if (it.id && own.has(it.id)) {
        await c.query('UPDATE team_phases SET name = $1, color = $2, position = $3, duration_days = $4 WHERE id = $5', [it.name, it.color, i, days, it.id]);
        continue;
      }
      const { rows: [n] } = await scope.insert(c, it, i, days);
      if (it.id) {
        await c.query(`UPDATE work_phase SET phase_id = $1 WHERE phase_id = $2 AND work_id IN (${inWorks(3)})`, [n.id, it.id, scope.key]);
        await c.query(`UPDATE task_phase SET phase_id = $1 WHERE phase_id = $2 AND task_id IN (${inTasks(3)})`, [n.id, it.id, scope.key]);
      }
    }
    for (const p of removed) {
      if (own.has(p.id)) await c.query('DELETE FROM team_phases WHERE id = $1', [p.id]);
      else await c.query(`DELETE FROM task_phase WHERE phase_id = $1 AND task_id IN (${inTasks(2)})`, [p.id, scope.key]);
    }
  });
}

router.put('/teams/:id/phases', ah(async (req, res) => {
  const id = intParam(req.params.id);
  await loadTeam(id);
  if (!(await canEdit(req.user, id))) throw new HttpError(403, 'Apenas a gestão da equipe altera as fases.');
  await savePhaseList(teamScope(id), req.body);
  res.json({ phases: await teamPhases({ query }, id), can_edit: true });
}));

// Projeto sem equipe (individual ou profissional): quem é dono monta as fases dele.
async function loadOwnProject(user, id) {
  const { rows: [p] } = await query('SELECT id, team_id, th_project_role($1, id) AS role FROM projects WHERE id = $2', [user.id, id]);
  if (!p || !p.role) throw new HttpError(404, 'Projeto não encontrado');
  return p;
}

async function canEditProject(user, projectId) {
  const { rows: [p] } = await query('SELECT team_id, th_project_role($1, id) AS role FROM projects WHERE id = $2', [user.id, projectId]);
  return !!p && !p.team_id && p.role === 'manage';
}

function assertProjectEditor(p) {
  if (p.team_id) throw new HttpError(400, 'As fases deste projeto são as da equipe.');
  if (p.role !== 'manage') throw new HttpError(403, 'Apenas o dono do projeto altera as fases.');
}

router.get('/projects/:id/phases', ah(async (req, res) => {
  const id = intParam(req.params.id);
  const p = await loadOwnProject(req.user, id);
  const phases = await projectPhases({ query }, id);
  const own = p.team_id ? [] : await ownPhases({ query }, id);
  res.json({ phases, is_default: !p.team_id && !own.length, can_edit: !p.team_id && p.role === 'manage' });
}));

router.put('/projects/:id/phases', ah(async (req, res) => {
  const id = intParam(req.params.id);
  assertProjectEditor(await loadOwnProject(req.user, id));
  await savePhaseList(projectScope(id), req.body);
  res.json({ phases: await projectPhases({ query }, id), can_edit: true });
}));

// Depois de mudar os dias das fases: propõe a nova data final dos projetos abertos (início + roteiro)
// e mostra o efeito na fila de cada desenvolvedor. Com dry_run só calcula; sem, grava.
const rescheduleSchema = z.object({
  work_ids: z.array(z.number().int().positive()).max(500).optional(),
  push: z.boolean().default(true),
  dry_run: z.boolean().default(true),
});

async function teamSchedule(run, teamId) {
  return scheduleOf(run, 'p.team_id = $1', teamId);
}

async function scheduleOf(run, where, key) {
  const { rows } = await run.query(
    `SELECT s.id, s.name, s.due_date, ws.start_date, ws.duration_days
       FROM project_sections s
       JOIN projects p ON p.id = s.project_id
       LEFT JOIN work_schedule ws ON ws.work_id = s.id
      WHERE ${where} AND s.completed_at IS NULL
      ORDER BY s.id`, [key]
  );
  const ids = rows.map(r => r.id);
  const owners = new Map(ids.map(id => [id, []]));
  if (ids.length) {
    const { rows: os } = await run.query(
      `SELECT wo.work_id, u.id, u.name FROM work_owners wo JOIN users u ON u.id = wo.user_id
        WHERE wo.work_id = ANY($1) ORDER BY u.name`, [ids]
    );
    for (const o of os) owners.get(o.work_id)?.push({ id: o.id, name: o.name });
  }
  return rows
    .map((r) => {
      const start = dayOf(r.start_date);
      if (!start) return null;
      const due = dayOf(r.due_date);
      const duration = due && due >= start ? Math.max(1, businessDaysBetween(start, due)) : Math.max(1, Number(r.duration_days) || DEFAULT_DURATION);
      const end = due && due >= start ? due : endAfter(start, duration);
      const list = owners.get(r.id) || [];
      return { id: r.id, name: r.name, start, end, duration, owners: list, owner_ids: list.map(o => o.id) };
    })
    .filter(Boolean);
}

function planReschedule(works, total, selectedIds, push, today) {
  const changed = new Map();
  const candidates = [];
  for (const w of works) {
    if (w.duration === total) continue;
    const newDue = endAfter(w.start, total);
    const selected = !selectedIds || selectedIds.has(w.id);
    candidates.push({ work_id: w.id, name: w.name, owners: w.owners.map(o => o.name), start: w.start, old_due: w.end, new_due: newDue, selected });
    if (selected) changed.set(w.id, newDue);
  }

  const plan = works.map(w => ({ ...w, old_start: w.start, old_end: w.end, end: changed.get(w.id) || w.end, duration: changed.has(w.id) ? total : w.duration }));
  plan.sort((a, b) => (a.old_start < b.old_start ? -1 : a.old_start > b.old_start ? 1 : a.id - b.id));
  const pushes = [];
  if (push) {
    const cursors = new Map();
    for (const w of plan) {
      const keys = w.owner_ids.map(String);
      if (!keys.length) continue;
      const cursor = keys.map(k => cursors.get(k)).filter(Boolean).sort().pop();
      let moved = changed.has(w.id);
      if (cursor && w.start < cursor && w.start > today) {
        w.start = nextBusiness(cursor);
        w.end = endAfter(w.start, w.duration);
        moved = true;
        if (!changed.has(w.id)) {
          pushes.push({ work_id: w.id, name: w.name, owners: w.owners.map(o => o.name), old_start: w.old_start, old_end: w.old_end, new_start: w.start, new_end: w.end });
        }
      }
      if (!moved) continue;
      const next = afterBusiness(w.end);
      for (const k of keys) { const cur = cursors.get(k); if (!cur || next > cur) cursors.set(k, next); }
    }
  }

  const byId = new Map(plan.map(w => [w.id, w]));
  for (const c of candidates) {
    const w = byId.get(c.work_id);
    if (c.selected && w) { c.new_start = w.start; c.new_due = w.end; }
  }

  const overlaps = [];
  if (!push) {
    const seen = new Set();
    for (const a of plan.filter(w => changed.has(w.id))) {
      for (const b of plan) {
        if (b.id === a.id || !sharesOwner(a.owner_ids, b.owner_ids)) continue;
        if (!(a.start <= b.end && b.start <= a.end)) continue;
        const key = [a.id, b.id].sort((x, y) => x - y).join('-');
        if (seen.has(key)) continue;
        seen.add(key);
        const shared = a.owners.filter(o => b.owner_ids.includes(o.id)).map(o => o.name);
        overlaps.push({ a: { id: a.id, name: a.name }, b: { id: b.id, name: b.name }, owners: shared });
      }
    }
  }
  return { candidates, plan, changed, pushes, overlaps };
}

router.post('/teams/:id/phases/reschedule', ah(async (req, res) => {
  const id = intParam(req.params.id);
  await loadTeam(id);
  if (!(await canEdit(req.user, id))) throw new HttpError(403, 'Apenas a gestão da equipe ajusta as datas pelas fases.');
  const phases = await teamPhases({ query }, id);
  res.json(await reschedule(req.body, phases, c => teamSchedule(c, id), req.user));
}));

router.post('/projects/:id/phases/reschedule', ah(async (req, res) => {
  const id = intParam(req.params.id);
  assertProjectEditor(await loadOwnProject(req.user, id));
  const phases = await projectPhases({ query }, id);
  res.json(await reschedule(req.body, phases, c => scheduleOf(c, 'p.id = $1', id), req.user));
}));

async function reschedule(body, phases, loadWorks, actor) {
  const d = parse(rescheduleSchema, body);
  const total = Math.max(1, sumPhaseDays(phases));
  const today = isoDate();
  const selected = d.work_ids ? new Set(d.work_ids) : null;

  const run = async (c) => {
    const r = planReschedule(await loadWorks(c), total, selected, d.push, today);
    if (!d.dry_run) {
      const write = r.plan.filter(w => r.changed.has(w.id) || r.pushes.some(p => p.work_id === w.id));
      for (const w of write) {
        const before = await readDates(c, w.id);
        await c.query(
          `INSERT INTO work_schedule (work_id, start_date, duration_days) VALUES ($1, $2, $3)
           ON CONFLICT (work_id) DO UPDATE SET start_date = EXCLUDED.start_date, duration_days = EXCLUDED.duration_days`,
          [w.id, w.start, Math.min(365, Math.max(1, w.duration))]
        );
        await c.query('UPDATE project_sections SET due_date = $1 WHERE id = $2', [w.end, w.id]);
        const after = await readDates(c, w.id);
        await logDates(c, {
          workId: w.id, kind: 'fases', before, after, userId: actor.id,
          reason: r.changed.has(w.id) ? `Roteiro de fases mudou para ${total} dias úteis` : 'Reajuste: projeto anterior mudou com o roteiro de fases',
        });
        await notifyDates(c, { workId: w.id, kind: 'fases', before, after, total, actor });
      }
    }
    return r;
  };
  const r = d.dry_run ? await run({ query }) : await tx(run);
  return { total, candidates: r.candidates, pushes: r.pushes, overlaps: r.overlaps, applied: !d.dry_run };
}

module.exports = router;
module.exports.canEdit = canEdit;
module.exports.canEditProject = canEditProject;
module.exports.planReschedule = planReschedule;
module.exports.teamSchedule = teamSchedule;
