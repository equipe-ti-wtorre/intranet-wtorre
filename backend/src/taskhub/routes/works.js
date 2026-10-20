const router = require('express').Router();
const { z } = require('zod');
const { query, tx } = require('../db');
const { ah, parse, intParam, HttpError } = require('../lib/http');
const { notify } = require('../lib/notify');
const { DEFAULT_DURATION, computeTimeline, estimateDuration, businessDaysBetween, dayOf } = require('../lib/timeline');

// Trabalhos: Projeto → Trabalhos → Tarefas. Ficam na tabela project_sections.
// Quem edita o projeto gerencia todos os trabalhos; o responsável gerencia o trabalho dele;
// participantes do trabalho veem só aquele trabalho e as tarefas dele.

const OPEN = `(ws.category IS NULL AND t.completed_at IS NULL OR ws.category IN ('todo','doing','blocked'))`;

const WORK_SELECT = `
  SELECT s.id, s.project_id, s.name, s.description, s.color, s.position, s.due_date, s.completed_at, s.created_at,
         (SELECT wsch.duration_days FROM work_schedule wsch WHERE wsch.work_id = s.id) AS duration_days,
         (SELECT wsch.start_date FROM work_schedule wsch WHERE wsch.work_id = s.id) AS start_date,
         s.owner_id, o.name AS owner_name, o.initials AS owner_initials, o.color AS owner_color,
         th_work_role($1, s.id) AS my_role,
         (SELECT MAX(v.visited_at) FROM work_visits v WHERE v.work_id = s.id AND v.user_id = $1) AS last_visit,
         (SELECT COUNT(*) FROM tasks t WHERE t.section_id = s.id)::int AS tasks_total,
         (SELECT COUNT(*) FROM tasks t LEFT JOIN workflow_statuses ws ON ws.id = t.status_id
           WHERE t.section_id = s.id AND (ws.category IN ('done','canceled') OR (ws.category IS NULL AND t.completed_at IS NOT NULL)))::int AS tasks_done,
         (SELECT COUNT(*) FROM tasks t LEFT JOIN workflow_statuses ws ON ws.id = t.status_id
           WHERE t.section_id = s.id AND ${OPEN} AND t.deadline < CURRENT_DATE)::int AS tasks_overdue,
         (SELECT COUNT(*) FROM tasks t LEFT JOIN workflow_statuses ws ON ws.id = t.status_id
           WHERE t.section_id = s.id AND ws.category = 'blocked')::int AS tasks_blocked,
         COALESCE((SELECT json_agg(json_build_object('id', u.id, 'name', u.name, 'initials', u.initials, 'color', u.color) ORDER BY u.name)
                     FROM work_members wm JOIN users u ON u.id = wm.user_id WHERE wm.work_id = s.id), '[]') AS members
    FROM project_sections s LEFT JOIN users o ON o.id = s.owner_id`;

async function projectRole(userId, projectId) {
  const { rows } = await query('SELECT th_project_role($1, $2) AS r', [userId, projectId]);
  return rows[0]?.r || null;
}
async function workRole(userId, workId) {
  const { rows } = await query('SELECT th_work_role($1, $2) AS r', [userId, workId]);
  return rows[0]?.r || null;
}
async function requireWork(user, workId, min = 'view') {
  const role = await workRole(user.id, workId);
  if (!role) throw new HttpError(404, 'Trabalho não encontrado');
  if (min === 'manage' && role !== 'manage') throw new HttpError(403, 'Apenas quem coordena o projeto ou o responsável pelo trabalho pode fazer isso.');
  return role;
}

const schema = z.object({
  name: z.string().trim().min(2, 'informe um nome').max(100),
  description: z.string().max(5000).default(''),
  owner_id: z.coerce.number().int().positive().nullable().optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#4c8dff'),
  members: z.array(z.coerce.number().int().positive()).max(200).default([]),
  duration_days: z.coerce.number().int().min(1).max(365).nullable().optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

// Junta o que veio com o que já estava salvo; com as duas datas, a duração vem delas.
async function saveSchedule(c, workId, d) {
  const { rows: [cur] } = await c.query(
    `SELECT s.due_date, ws.start_date, ws.duration_days FROM project_sections s
       LEFT JOIN work_schedule ws ON ws.work_id = s.id WHERE s.id = $1`, [workId]
  );
  const start = d.start_date !== undefined ? d.start_date : (cur?.start_date || null);
  const due = d.due_date !== undefined ? d.due_date : (cur?.due_date || null);
  if (start && due && due < start) throw new HttpError(400, 'A data final deve ser igual ou depois da inicial.');
  let days = d.duration_days !== undefined ? d.duration_days : (cur?.duration_days ?? null);
  if (start && due) days = Math.min(365, Math.max(1, businessDaysBetween(start, due)));
  if (!start && days == null) {
    await c.query('DELETE FROM work_schedule WHERE work_id = $1', [workId]);
    return;
  }
  await c.query(
    `INSERT INTO work_schedule (work_id, start_date, duration_days) VALUES ($1, $2, $3)
     ON CONFLICT (work_id) DO UPDATE SET start_date = EXCLUDED.start_date, duration_days = EXCLUDED.duration_days`,
    [workId, start || null, days ?? DEFAULT_DURATION]
  );
}

router.get('/projects/:id/works', ah(async (req, res) => {
  const pid = intParam(req.params.id);
  const role = await projectRole(req.user.id, pid);
  if (!role) throw new HttpError(404, 'Projeto não encontrado');
  const { rows } = await query(
    `${WORK_SELECT} WHERE s.project_id = $2 AND th_work_role($1, s.id) IS NOT NULL ORDER BY s.position, s.id`,
    [req.user.id, pid]
  );
  res.json({ works: rows, can_create: ['manage', 'edit'].includes(role) });
}));

router.post('/projects/:id/works', ah(async (req, res) => {
  const pid = intParam(req.params.id);
  if (!['manage', 'edit'].includes(await projectRole(req.user.id, pid))) {
    throw new HttpError(403, 'Quem cria trabalhos é quem coordena o projeto.');
  }
  const d = parse(schema, req.body);
  if (d.start_date && d.due_date && d.due_date < d.start_date) throw new HttpError(400, 'A data final deve ser igual ou depois da inicial.');
  const id = await tx(async (c) => {
    const { rows: [pos] } = await c.query(
      'SELECT COALESCE(MAX(position), -1) + 1 AS n FROM project_sections WHERE project_id = $1 AND position < 999',
      [pid]
    );
    const { rows: [w] } = await c.query(
      `INSERT INTO project_sections (project_id, name, description, owner_id, due_date, color, created_by, position)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [pid, d.name, d.description, d.owner_id ?? req.user.id, d.due_date || null, d.color, req.user.id, pos.n]
    );
    await setMembers(c, req, w.id, d.members, d.name);
    if (d.start_date || d.duration_days) await saveSchedule(c, w.id, d);
    if (d.owner_id && d.owner_id !== req.user.id) {
      await notify(c, { userId: d.owner_id, actorId: req.user.id, type: 'work_owner', projectId: pid,
        title: `${req.user.name} colocou você como responsável por um trabalho`, body: d.name });
    }
    return w.id;
  });
  const { rows } = await query(`${WORK_SELECT} WHERE s.id = $2`, [req.user.id, id]);
  res.status(201).json(rows[0]);
}));

async function setMembers(c, req, workId, ids, name) {
  const { rows: cur } = await c.query('SELECT user_id FROM work_members WHERE work_id = $1', [workId]);
  const before = new Set(cur.map(r => r.user_id));
  await c.query('DELETE FROM work_members WHERE work_id = $1', [workId]);
  for (const uid of new Set(ids)) {
    await c.query('INSERT INTO work_members (work_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [workId, uid]);
    if (!before.has(uid) && uid !== req.user.id) {
      await notify(c, { userId: uid, actorId: req.user.id, type: 'work_added',
        title: `${req.user.name} incluiu você em um trabalho`, body: name });
    }
  }
}

router.get('/works/:id', ah(async (req, res) => {
  const id = intParam(req.params.id);
  const role = await requireWork(req.user, id);
  const { rows: [w] } = await query(`${WORK_SELECT} WHERE s.id = $2`, [req.user.id, id]);
  const { rows: [p] } = await query(
    `SELECT p.id, p.name, p.color, p.space, t.sector_id, sc.name AS sector_name, th_project_role($1, p.id) AS my_role
       FROM projects p
       LEFT JOIN teams t ON t.id = p.team_id
       LEFT JOIN sectors sc ON sc.id = t.sector_id
      WHERE p.id = $2`, [req.user.id, w.project_id]
  );
  const { rows: statuses } = await query(
    'SELECT * FROM workflow_statuses WHERE project_id = $1 ORDER BY position, id', [w.project_id]
  );
  res.json({ ...w, my_role: role, project: p, statuses });
}));

router.post('/works/:id/visit', ah(async (req, res) => {
  const id = intParam(req.params.id);
  await requireWork(req.user, id);
  await query(
    `INSERT INTO work_visits (user_id, work_id, visited_at) VALUES ($1, $2, NOW())
     ON CONFLICT (user_id, work_id) DO UPDATE SET visited_at = NOW()`, [req.user.id, id]
  );
  res.json({ ok: true });
}));

router.patch('/works/:id', ah(async (req, res) => {
  const id = intParam(req.params.id);
  await requireWork(req.user, id, 'manage');
  const d = parse(schema.partial().extend({ done: z.boolean().optional(), position: z.number().int().optional() }), req.body);
  await tx(async (c) => {
    const sets = []; const params = [];
    for (const k of ['name', 'description', 'owner_id', 'due_date', 'color', 'position']) {
      if (d[k] !== undefined) { params.push(d[k]); sets.push(`${k} = $${params.length}`); }
    }
    if (d.done !== undefined) sets.push(d.done ? 'completed_at = NOW()' : 'completed_at = NULL');
    if (sets.length) { params.push(id); await c.query(`UPDATE project_sections SET ${sets.join(', ')} WHERE id = $${params.length}`, params); }
    if (d.start_date !== undefined || d.duration_days !== undefined || d.due_date !== undefined) await saveSchedule(c, id, d);
    if (d.members) {
      const { rows: [w] } = await c.query('SELECT name FROM project_sections WHERE id = $1', [id]);
      await setMembers(c, req, id, d.members, w.name);
    }
  });
  const { rows } = await query(`${WORK_SELECT} WHERE s.id = $2`, [req.user.id, id]);
  res.json(rows[0]);
}));

router.delete('/works/:id', ah(async (req, res) => {
  const id = intParam(req.params.id);
  const { rows: [w] } = await query('SELECT project_id FROM project_sections WHERE id = $1', [id]);
  if (!w) throw new HttpError(404, 'Trabalho não encontrado');
  if (!['manage', 'edit'].includes(await projectRole(req.user.id, w.project_id))) {
    throw new HttpError(403, 'Quem exclui trabalhos é quem coordena o projeto.');
  }
  await tx(async (c) => {
    await c.query('DELETE FROM tasks WHERE section_id = $1', [id]);
    await c.query('DELETE FROM project_sections WHERE id = $1', [id]);
  });
  res.json({ ok: true });
}));

async function timelineData(userId, pid) {
  const { rows: [p] } = await query(
    'SELECT id, start_date, end_date, created_at FROM projects WHERE id = $1', [pid]
  );
  const { rows: works } = await query(
    `${WORK_SELECT} WHERE s.project_id = $2 AND th_work_role($1, s.id) IS NOT NULL ORDER BY s.position, s.id`,
    [userId, pid]
  );
  const start = p.start_date || dayOf(p.created_at);
  const items = works.map(w => ({ ...w, duration_saved: w.duration_days != null, duration_days: estimateDuration(w) }));
  const plan = computeTimeline(items, start);
  return {
    project_start: start,
    end_date: p.end_date,
    forecast_end: plan.forecast_end,
    works: items.map((w, i) => ({ ...w, tl_start: plan.rows[i].start, tl_end: plan.rows[i].end, tl_late: plan.rows[i].late })),
  };
}

router.get('/projects/:id/timeline', ah(async (req, res) => {
  const pid = intParam(req.params.id);
  const role = await projectRole(req.user.id, pid);
  if (!role) throw new HttpError(404, 'Projeto não encontrado');
  res.json({ ...(await timelineData(req.user.id, pid)), can_edit: ['manage', 'edit'].includes(role) });
}));

const timelineSchema = z.object({
  items: z.array(z.object({
    id: z.number().int().positive().optional(),
    name: z.string().trim().min(2, 'informe um nome').max(100).optional(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    duration_days: z.coerce.number().int().min(1, 'a duração mínima é 1 dia').max(365),
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  })).max(300),
  remove: z.array(z.number().int().positive()).max(300).default([]),
});

router.put('/projects/:id/timeline', ah(async (req, res) => {
  const pid = intParam(req.params.id);
  const role = await projectRole(req.user.id, pid);
  if (!role) throw new HttpError(404, 'Projeto não encontrado');
  if (!['manage', 'edit'].includes(role)) throw new HttpError(403, 'Quem muda a linha do tempo é quem coordena o projeto.');
  const d = parse(timelineSchema, req.body);

  for (const it of d.items) {
    if (!it.id && !it.name) throw new HttpError(400, 'Informe o nome do novo trabalho.');
  }
  const kept = d.items.filter(it => it.id).map(it => it.id);
  const sent = new Set([...kept, ...d.remove]);
  if (sent.size !== kept.length + d.remove.length) throw new HttpError(400, 'Trabalho repetido na linha do tempo.');

  const { rows: [p] } = await query('SELECT start_date, created_at FROM projects WHERE id = $1', [pid]);
  await tx(async (c) => {
    const { rows: cur } = await c.query('SELECT id, completed_at FROM project_sections WHERE project_id = $1', [pid]);
    const byId = new Map(cur.map(w => [w.id, w]));
    if (cur.length !== sent.size || [...sent].some(id => !byId.has(id))) {
      throw new HttpError(409, 'Os trabalhos do projeto mudaram. Recarregue a linha do tempo e simule de novo.');
    }

    for (const id of d.remove) {
      await c.query('DELETE FROM tasks WHERE section_id = $1', [id]);
      await c.query('DELETE FROM project_sections WHERE id = $1', [id]);
    }

    const ids = [];
    for (const [i, it] of d.items.entries()) {
      if (it.id) {
        await c.query('UPDATE project_sections SET position = $1 WHERE id = $2', [i, it.id]);
        ids.push(it.id);
      } else {
        const { rows: [w] } = await c.query(
          `INSERT INTO project_sections (project_id, name, description, owner_id, color, created_by, position)
           VALUES ($1, $2, '', $3, $4, $3, $5) RETURNING id`,
          [pid, it.name, req.user.id, it.color || '#4c8dff', i]
        );
        ids.push(w.id);
      }
    }
    const plan = computeTimeline(
      d.items.map((it, i) => ({ duration_days: it.duration_days, start_date: it.start_date || null, completed_at: byId.get(ids[i])?.completed_at || null })),
      p.start_date || dayOf(p.created_at)
    );
    for (const [i, row] of plan.rows.entries()) {
      const done = !!byId.get(ids[i])?.completed_at;
      await c.query(
        `INSERT INTO work_schedule (work_id, start_date, duration_days) VALUES ($1, $2, $3)
         ON CONFLICT (work_id) DO UPDATE SET start_date = EXCLUDED.start_date, duration_days = EXCLUDED.duration_days`,
        [ids[i], done ? (d.items[i].start_date || null) : row.start, d.items[i].duration_days]
      );
      if (!done) await c.query('UPDATE project_sections SET due_date = $1 WHERE id = $2', [row.end, ids[i]]);
    }
  });

  res.json({ ...(await timelineData(req.user.id, pid)), can_edit: true });
}));

module.exports = router;
