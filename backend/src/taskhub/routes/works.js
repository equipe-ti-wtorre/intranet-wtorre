const router = require('express').Router();
const { z } = require('zod');
const { query, tx } = require('../db');
const { ah, parse, intParam, HttpError } = require('../lib/http');
const { notify } = require('../lib/notify');
const { DEFAULT_DURATION, computeTimeline, estimateDuration, businessDaysBetween, dayOf, ownerIdsOf: laneOwners, scheduleImpact } = require('../lib/timeline');
const { projectTeam, projectPhases, assertProjectPhase, workPhase } = require('../lib/phases');
const { readDates, logDates, setBaseline, notifyDates, datesChanged } = require('../lib/work-dates');
const { canEdit: canEditPhases, canEditProject: canEditProjectPhases } = require('./phases');
const { teamOfBoard } = require('../lib/boards');
const { env } = require('../../config/env');
const blobService = require('../../services/blob.service');
const { uploadTaskFiles, handleTaskFilesMulterError, blobNameFor } = require('../../config/taskhub-files-upload');
const { formatFile, safeOriginalName, unlinkQuiet } = require('../lib/attachments');

// Trabalhos: Projeto → Trabalhos → Tarefas. Ficam na tabela project_sections.
// No quadro da equipe (Setor → Equipe → Projeto → Tarefa) cada trabalho aparece como "projeto".
// Quem edita o projeto gerencia todos os trabalhos; os responsáveis (work_owners) gerenciam o trabalho deles;
// participantes do trabalho veem só aquele trabalho e as tarefas dele.
// No quadro da equipe, work_members são os solicitantes (papel follow): veem a fase e o histórico, sem tarefas.

const OPEN = `(ws.category IS NULL AND t.completed_at IS NULL OR ws.category IN ('todo','doing','blocked'))`;

const WORK_SELECT = `
  SELECT s.id, s.project_id, s.name, s.description, s.color, s.position, s.due_date, s.completed_at, s.created_at,
         (SELECT wsch.duration_days FROM work_schedule wsch WHERE wsch.work_id = s.id) AS duration_days,
         (SELECT wsch.start_date FROM work_schedule wsch WHERE wsch.work_id = s.id) AS start_date,
         (SELECT wi.department FROM work_info wi WHERE wi.work_id = s.id) AS department,
         (SELECT pz.start_date FROM work_pauses pz WHERE pz.work_id = s.id AND pz.end_date >= CURRENT_DATE ORDER BY pz.start_date, pz.id LIMIT 1) AS pause_start,
         (SELECT pz.end_date FROM work_pauses pz WHERE pz.work_id = s.id AND pz.end_date >= CURRENT_DATE ORDER BY pz.start_date, pz.id LIMIT 1) AS pause_end,
         s.owner_id, o.name AS owner_name, o.initials AS owner_initials, o.color AS owner_color,
         wp.phase_id, sph.name AS phase_name, sph.color AS phase_color, wp.changed_at AS phase_changed_at, wp.board_position,
         th_work_role($1, s.id) AS my_role,
         (SELECT MAX(v.visited_at) FROM work_visits v WHERE v.work_id = s.id AND v.user_id = $1) AS last_visit,
         (SELECT COUNT(*) FROM tasks t WHERE t.section_id = s.id)::int AS tasks_total,
         (SELECT COUNT(*) FROM tasks t LEFT JOIN workflow_statuses ws ON ws.id = t.status_id
           WHERE t.section_id = s.id AND (ws.category IN ('done','canceled') OR (ws.category IS NULL AND t.completed_at IS NOT NULL)))::int AS tasks_done,
         (SELECT COUNT(*) FROM tasks t LEFT JOIN workflow_statuses ws ON ws.id = t.status_id
           WHERE t.section_id = s.id AND ${OPEN} AND t.deadline < CURRENT_DATE)::int AS tasks_overdue,
         (SELECT COUNT(*) FROM tasks t LEFT JOIN workflow_statuses ws ON ws.id = t.status_id
           WHERE t.section_id = s.id AND ws.category = 'blocked')::int AS tasks_blocked,
         COALESCE((SELECT json_agg(json_build_object('id', u.id, 'name', u.name, 'initials', u.initials, 'color', u.color, 'department', u.department) ORDER BY u.name)
                     FROM work_members wm JOIN users u ON u.id = wm.user_id WHERE wm.work_id = s.id), '[]') AS members,
         COALESCE((SELECT json_agg(json_build_object('id', u.id, 'name', u.name, 'initials', u.initials, 'color', u.color, 'department', u.department) ORDER BY u.id = s.owner_id DESC, u.name)
                     FROM work_owners wo JOIN users u ON u.id = wo.user_id WHERE wo.work_id = s.id), '[]') AS owners,
         COALESCE((SELECT json_agg(json_build_object('id', r.id, 'name', r.name) ORDER BY r.name)
                     FROM work_links lk JOIN project_sections r ON r.id = lk.related_id WHERE lk.work_id = s.id), '[]') AS continues,
         COALESCE((SELECT json_agg(json_build_object('id', r.id, 'name', r.name) ORDER BY r.name)
                     FROM work_links lk JOIN project_sections r ON r.id = lk.work_id WHERE lk.related_id = s.id), '[]') AS continued_by
    FROM project_sections s LEFT JOIN users o ON o.id = s.owner_id
    LEFT JOIN work_phase wp ON wp.work_id = s.id
    LEFT JOIN team_phases sph ON sph.id = wp.phase_id`;

// Posição no fim da coluna (fase) do Kanban de trabalhos deste projeto.
async function endOfColumn(c, projectId, phaseId) {
  const { rows: [r] } = await c.query(
    `SELECT COALESCE(MAX(wp.board_position), 0) + 1000 AS p FROM work_phase wp
       JOIN project_sections s ON s.id = wp.work_id WHERE s.project_id = $1 AND wp.phase_id = $2`, [projectId, phaseId]
  );
  return Number(r.p);
}

// Renumera a coluna inteira com o trabalho antes de beforeId (ou no fim): funciona mesmo com posições repetidas.
async function placeInColumn(c, projectId, phaseId, workId, beforeId) {
  const { rows } = await c.query(
    `SELECT wp.work_id FROM work_phase wp JOIN project_sections s ON s.id = wp.work_id
      WHERE s.project_id = $1 AND wp.phase_id = $2 AND wp.work_id <> $3
      ORDER BY wp.board_position, s.position, s.id`, [projectId, phaseId, workId]
  );
  const ids = rows.map(r => r.work_id);
  const at = beforeId ? ids.indexOf(beforeId) : -1;
  ids.splice(at < 0 ? ids.length : at, 0, workId);
  for (const [i, wid] of ids.entries()) {
    await c.query('UPDATE work_phase SET board_position = $1 WHERE work_id = $2', [(i + 1) * 1000, wid]);
  }
}

async function startWorkPhase(c, req, projectId, workId, phaseId = null) {
  const id = phaseId || (await projectPhases(c, projectId))[0]?.id;
  if (!id) return;
  await c.query('INSERT INTO work_phase (work_id, phase_id, board_position, changed_by) VALUES ($1, $2, $3, $4)',
    [workId, id, await endOfColumn(c, projectId, id), req.user.id]);
  await c.query('INSERT INTO work_phase_log (work_id, phase_id, changed_by) VALUES ($1, $2, $3)', [workId, id, req.user.id]);
}

async function projectRole(userId, projectId) {
  const { rows } = await query('SELECT th_project_role($1, $2) AS r', [userId, projectId]);
  return rows[0]?.r || null;
}
// Quadro de equipe: a gestão monta as fases da equipe. Projeto sem equipe: o dono monta as dele.
async function phaseAccess(user, projectId, teamId) {
  return teamId
    ? { phases_scope: 'team', phases_editable: await canEditPhases(user, teamId) }
    : { phases_scope: 'project', phases_editable: await canEditProjectPhases(user, projectId) };
}
async function workRole(userId, workId) {
  const { rows } = await query('SELECT th_work_role($1, $2) AS r', [userId, workId]);
  return rows[0]?.r || null;
}
async function requireWork(user, workId, min = 'view') {
  const role = await workRole(user.id, workId);
  if (!role) throw new HttpError(404, 'Projeto não encontrado');
  if (min === 'manage' && role !== 'manage') throw new HttpError(403, 'Você só acompanha este projeto. Quem é da equipe ou o desenvolvedor pode alterar.');
  return role;
}

const schema = z.object({
  name: z.string().trim().min(2, 'informe um nome').max(100),
  description: z.string().max(5000).default(''),
  owner_id: z.coerce.number().int().positive().nullable().optional(),
  owner_ids: z.array(z.coerce.number().int().positive()).min(1, 'escolha pelo menos um desenvolvedor').max(20).optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#4c8dff'),
  members: z.array(z.coerce.number().int().positive()).max(200).default([]),
  duration_days: z.coerce.number().int().min(1).max(365).nullable().optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  continues_ids: z.array(z.coerce.number().int().positive()).max(30).optional(),
  department: z.string().trim().max(200).nullable().optional(),
  push: z.boolean().optional(),
  adjust_ids: z.array(z.coerce.number().int().positive()).max(200).optional(),
  skip_ids: z.array(z.coerce.number().int().positive()).max(200).optional(),
  date_reason: z.string().trim().max(500).optional(),
});

const REASON_MIN = 10;
function requireReason(reason) {
  const r = (reason || '').trim();
  if (r.length < REASON_MIN) throw new HttpError(400, 'Informe o motivo da alteração das datas (pelo menos 10 letras).');
  return r;
}

// Com conflito, só grava se a pessoa decidiu o que reajustar (push = todos).
const decided = (d) => !!d.push || d.adjust_ids !== undefined || d.skip_ids !== undefined;
const adjustChoice = (d) => (d.push ? {} : { adjust_ids: d.adjust_ids, skip_ids: d.skip_ids });

const dm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const dmy = (iso) => `${dm(iso)}/${iso.slice(0, 4)}`;

// Grava as pausas dos projetos já iniciados e avisa: solicitante sem a previsão, desenvolvedor com ela.
async function savePauses(c, req, pauses, causeId, causeName, projectId) {
  for (const p of pauses) {
    await c.query(
      'INSERT INTO work_pauses (work_id, start_date, end_date, cause_work_id, created_by) VALUES ($1, $2, $3, $4, $5)',
      [p.work_id, p.start, p.end, causeId, req.user.id]
    );
    const text = `O projeto "${p.name}" fica em pausa de ${dm(p.start)} a ${dm(p.end)} enquanto a equipe atende "${causeName}".`;
    const { rows: devs } = await c.query(
      `SELECT user_id FROM work_owners WHERE work_id = $1
       UNION SELECT owner_id FROM project_sections WHERE id = $1 AND owner_id IS NOT NULL`, [p.work_id]
    );
    const devIds = new Set(devs.map(r => r.user_id));
    for (const uid of devIds) {
      await notify(c, { userId: uid, actorId: req.user.id, type: 'work_pause', projectId,
        title: text, body: `Nova previsão de entrega: ${dmy(p.new_end)}.` });
    }
    const { rows: reqs } = await c.query('SELECT user_id FROM work_members WHERE work_id = $1', [p.work_id]);
    for (const r of reqs) {
      if (devIds.has(r.user_id)) continue;
      await notify(c, { userId: r.user_id, actorId: req.user.id, type: 'work_pause', projectId, title: text, body: p.name });
    }
  }
}

async function applyAdjust(c, req, impact, workId, name, projectId) {
  if (!impact?.conflicts.length) return;
  const before = new Map();
  for (const u of impact.updates) before.set(u.id, await readDates(c, u.id));
  await applyScheduleUpdates(c, impact.updates);
  await placeBeforeConflicts(c, projectId, workId, impact.updates.map((u) => u.id));
  const paused = new Map(impact.pauses.map(p => [p.work_id, p]));
  for (const u of impact.updates) {
    const p = paused.get(u.id);
    const after = await readDates(c, u.id);
    await logDates(c, {
      workId: u.id, kind: p ? 'pausa' : 'reajuste', before: before.get(u.id), after,
      reason: p ? `Pausa de ${dm(p.start)} a ${dm(p.end)} para o projeto ${name}` : `Reajuste: entrada do projeto ${name}`,
      causeId: workId, userId: req.user.id,
    });
    if (!p) await notifyDates(c, { workId: u.id, kind: 'reajuste', before: before.get(u.id), after, causeName: name, actor: req.user });
  }
  await savePauses(c, req, impact.pauses, workId, name, projectId);
}

async function saveDepartment(c, workId, department) {
  const value = (department || '').trim() || null;
  await c.query(
    `INSERT INTO work_info (work_id, department) VALUES ($1, $2)
     ON CONFLICT (work_id) DO UPDATE SET department = EXCLUDED.department`, [workId, value]
  );
}

// No zod 4, partial() mantém os defaults: sem tirar, um PATCH só com done apagaria descrição, cor e solicitantes.
const patchSchema = schema.extend({
  description: z.string().max(5000),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  members: z.array(z.coerce.number().int().positive()).max(200),
}).partial().extend({ done: z.boolean().optional(), position: z.number().int().optional(), push: z.boolean().optional() });

// Junta o que veio com o que já estava salvo; com as duas datas, a duração vem delas.
async function saveSchedule(c, workId, d) {
  const { rows: [cur] } = await c.query(
    `SELECT s.due_date, ws.start_date, ws.duration_days FROM project_sections s
       LEFT JOIN work_schedule ws ON ws.work_id = s.id WHERE s.id = $1`, [workId]
  );
  const start = d.start_date !== undefined ? d.start_date : (cur?.start_date || null);
  const due = d.due_date !== undefined ? d.due_date : (cur?.due_date || null);
  if (start && due && due < start) throw new HttpError(400, 'A previsão de entrega deve ser igual ou depois da data inicial.');
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

// Solicitante acompanha a fase; a previsão de entrega é só da equipe.
function forViewer(w) {
  if (!w || w.my_role !== 'follow') return w;
  const out = { ...w, due_date: null, duration_days: null, ...('planned_due' in w ? { planned_due: null } : {}) };
  if ('tl_end' in w) Object.assign(out, { tl_end: null, tl_late: false });
  return out;
}

function timelineItem(w) {
  return { duration_days: estimateDuration(w), start_date: w.start_date, completed_at: w.completed_at, owner_ids: laneOwners(w) };
}

async function boardImpact(run, userId, pid, incoming) {
  const { rows: [p] } = await run.query('SELECT start_date, created_at FROM projects WHERE id = $1', [pid]);
  const { rows: works } = await run.query(
    `${WORK_SELECT} WHERE s.project_id = $2 ORDER BY s.position, s.id`,
    [userId, pid]
  );
  return scheduleImpact(works.map((w) => ({ ...w, duration_days: estimateDuration(w) })), incoming, p.start_date || dayOf(p.created_at));
}

function conflictError(impact) {
  throw new HttpError(409, 'As datas cruzam projetos dos mesmos desenvolvedores.', {
    conflicts: impact.conflicts,
    suggestion: impact.suggestion,
    duration_days: impact.duration_days,
  });
}

async function applyScheduleUpdates(c, updates) {
  for (const u of updates) {
    await c.query(
      `INSERT INTO work_schedule (work_id, start_date, duration_days) VALUES ($1, $2, $3)
       ON CONFLICT (work_id) DO UPDATE SET start_date = EXCLUDED.start_date, duration_days = EXCLUDED.duration_days`,
      [u.id, u.start, u.duration]
    );
    await c.query('UPDATE project_sections SET due_date = $1 WHERE id = $2', [u.end, u.id]);
  }
}

async function placeBeforeConflicts(c, projectId, workId, conflictIds) {
  if (!conflictIds.length) return;
  const { rows } = await c.query(
    'SELECT id FROM project_sections WHERE project_id = $1 ORDER BY position, id', [projectId]
  );
  const ids = rows.map((r) => r.id).filter((id) => id !== workId);
  const idxs = conflictIds.map((id) => ids.indexOf(id)).filter((i) => i >= 0);
  const at = idxs.length ? Math.min(...idxs) : ids.length;
  ids.splice(at, 0, workId);
  for (const [i, id] of ids.entries()) {
    await c.query('UPDATE project_sections SET position = $1 WHERE id = $2', [i, id]);
  }
}

router.get('/projects/:id/works', ah(async (req, res) => {
  const pid = intParam(req.params.id);
  const role = await projectRole(req.user.id, pid);
  if (!role) throw new HttpError(404, 'Projeto não encontrado');
  const { rows } = await query(
    `${WORK_SELECT} WHERE s.project_id = $2 AND th_work_role($1, s.id) IS NOT NULL ORDER BY s.position, s.id`,
    [req.user.id, pid]
  );
  const teamId = await projectTeam({ query }, pid);
  res.json({
    works: rows.map(forViewer),
    can_create: ['manage', 'edit'].includes(role),
    phases: await projectPhases({ query }, pid),
    team_id: teamId,
    ...(await phaseAccess(req.user, pid, teamId)),
  });
}));

router.patch('/works/:id/phase', ah(async (req, res) => {
  const id = intParam(req.params.id);
  await requireWork(req.user, id, 'manage');
  // before_id: soltar antes deste trabalho; null: no fim da coluna; ausente: só muda a fase (vai para o fim).
  const d = parse(z.object({
    phase_id: z.coerce.number().int().positive(),
    before_id: z.coerce.number().int().positive().nullable().optional(),
  }), req.body);
  const { rows: [w] } = await query('SELECT project_id, name FROM project_sections WHERE id = $1', [id]);
  await assertProjectPhase({ query }, w.project_id, d.phase_id);
  await tx(async (c) => {
    const before = await workPhase(c, id);
    const moved = before !== d.phase_id;
    if (!moved && d.before_id === undefined) return;
    if (moved) {
      await c.query(
        `INSERT INTO work_phase (work_id, phase_id, board_position, changed_at, changed_by) VALUES ($1, $2, $3, NOW(), $4)
         ON CONFLICT (work_id) DO UPDATE SET phase_id = EXCLUDED.phase_id, board_position = EXCLUDED.board_position,
           changed_at = EXCLUDED.changed_at, changed_by = EXCLUDED.changed_by`,
        [id, d.phase_id, await endOfColumn(c, w.project_id, d.phase_id), req.user.id]
      );
    }
    if (d.before_id !== undefined) await placeInColumn(c, w.project_id, d.phase_id, id, d.before_id);
    // Sem fase gravada, o trabalho aparece na primeira coluna: reordenar ali não é mudança de fase.
    const shown = before ?? (await projectPhases(c, w.project_id))[0]?.id;
    if (shown === d.phase_id) return;
    await c.query('INSERT INTO work_phase_log (work_id, phase_id, changed_by) VALUES ($1, $2, $3)', [id, d.phase_id, req.user.id]);
    const { rows: [ph] } = await c.query('SELECT name FROM team_phases WHERE id = $1', [d.phase_id]);
    for (const uid of await followersOf(c, id)) {
      await notify(c, { userId: uid, actorId: req.user.id, type: 'work_phase', projectId: w.project_id,
        title: `${req.user.name} passou o projeto "${w.name}" para ${ph.name}`, body: w.name });
    }
  });
  const { rows } = await query(`${WORK_SELECT} WHERE s.id = $2`, [req.user.id, id]);
  res.json(forViewer(rows[0]));
}));

const previewSchema = z.object({
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  owner_ids: z.array(z.coerce.number().int().positive()).min(1).max(20),
  exclude_id: z.coerce.number().int().positive().optional(),
  adjust_ids: z.array(z.coerce.number().int().positive()).max(200).optional(),
  skip_ids: z.array(z.coerce.number().int().positive()).max(200).optional(),
});

router.post('/projects/:id/works/schedule-preview', ah(async (req, res) => {
  const pid = intParam(req.params.id);
  if (!['manage', 'edit'].includes(await projectRole(req.user.id, pid))) {
    throw new HttpError(403, (await teamOfBoard({ query }, pid))
      ? 'Quem cria projetos é quem participa da equipe.' : 'Quem cria projetos é quem coordena este quadro.');
  }
  const d = parse(previewSchema, req.body);
  if (d.due_date < d.start_date) throw new HttpError(400, 'A previsão de entrega deve ser igual ou depois da data inicial.');
  const impact = await boardImpact({ query }, req.user.id, pid, {
    start: d.start_date, due: d.due_date, owner_ids: d.owner_ids, exclude_id: d.exclude_id || null, ...adjustChoice(d),
  });
  res.json({ conflicts: impact.conflicts, suggestion: impact.suggestion, duration_days: impact.duration_days });
}));

router.post('/projects/:id/works', ah(async (req, res) => {
  const pid = intParam(req.params.id);
  if (!['manage', 'edit'].includes(await projectRole(req.user.id, pid))) {
    throw new HttpError(403, (await teamOfBoard({ query }, pid))
      ? 'Quem cria projetos é quem participa da equipe.' : 'Quem cria projetos é quem coordena este quadro.');
  }
  const d = parse(schema.extend({ phase_id: z.coerce.number().int().positive().optional() }), req.body);
  if (d.start_date && d.due_date && d.due_date < d.start_date) throw new HttpError(400, 'A previsão de entrega deve ser igual ou depois da data inicial.');
  if (d.phase_id) await assertProjectPhase({ query }, pid, d.phase_id);
  const board = !!(await teamOfBoard({ query }, pid));
  const ownersList = ownerIdsOf(d) || [req.user.id];
  let impact = null;
  if (d.start_date && d.due_date) {
    impact = await boardImpact({ query }, req.user.id, pid, {
      start: d.start_date, due: d.due_date, owner_ids: ownersList, exclude_id: null, ...adjustChoice(d),
    });
    if (impact.conflicts.length && !decided(d)) throw conflictError(impact);
  }
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
    const owners = await setOwners(c, req, w.id, pid, ownerIdsOf(d) || [req.user.id], d.name, board);
    await setMembers(c, req, w.id, pid, d.members, d.name, owners);
    if (d.continues_ids !== undefined) await setLinks(c, w.id, pid, d.continues_ids);
    if (d.start_date || d.duration_days) await saveSchedule(c, w.id, d);
    if (d.department !== undefined) await saveDepartment(c, w.id, d.department);
    await startWorkPhase(c, req, pid, w.id, d.phase_id);
    const dates = await readDates(c, w.id);
    if (dates.start || dates.due) {
      await setBaseline(c, w.id, dates.start, dates.due, req.user.id);
      await logDates(c, { workId: w.id, kind: 'criacao', before: null, after: dates, reason: 'Projeto criado', userId: req.user.id });
    }
    await applyAdjust(c, req, impact, w.id, d.name, pid);
    return w.id;
  });
  const { rows } = await query(`${WORK_SELECT} WHERE s.id = $2`, [req.user.id, id]);
  res.status(201).json(forViewer(rows[0]));
}));

const ownerIdsOf = (d) => d.owner_ids || (d.owner_id ? [d.owner_id] : undefined);

async function activeIds(c, ids) {
  if (!ids.length) return new Set();
  const { rows } = await c.query('SELECT id FROM users WHERE id = ANY($1) AND active IS DISTINCT FROM false', [ids]);
  return new Set(rows.map(r => r.id));
}

// Responsáveis: gravados em work_owners; owner_id fica com o primeiro (linha do tempo, painéis e filtros usam ele).
// No quadro da equipe, só quem é da equipe pode ser responsável.
async function setOwners(c, req, workId, projectId, ids, name, board = false) {
  const list = [...new Set(ids)];
  if (!list.length) throw new HttpError(400, 'Escolha pelo menos um desenvolvedor.');
  const active = await activeIds(c, list);
  if (list.some(id => !active.has(id))) throw new HttpError(400, 'Desenvolvedor não encontrado ou inativo.');
  if (board) {
    for (const uid of list) {
      const { rows: [r] } = await c.query('SELECT th_project_role($1, $2) AS r', [uid, projectId]);
      if (!['manage', 'edit'].includes(r?.r)) throw new HttpError(400, 'Desenvolvedores precisam ser da equipe.');
    }
  }
  const { rows: cur } = await c.query('SELECT user_id FROM work_owners WHERE work_id = $1', [workId]);
  const before = new Set(cur.map(r => r.user_id));
  await c.query('DELETE FROM work_owners WHERE work_id = $1', [workId]);
  for (const uid of list) {
    await c.query('INSERT INTO work_owners (work_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [workId, uid]);
    if (!before.has(uid)) {
      await notify(c, { userId: uid, actorId: req.user.id, type: 'work_owner', projectId,
        title: `${req.user.name} colocou você como desenvolvedor de um projeto`, body: name });
    }
  }
  await c.query('UPDATE project_sections SET owner_id = $1 WHERE id = $2', [list[0], workId]);
  return list;
}

// work_members são os solicitantes: quem pediu o projeto e só acompanha.
// Quem já edita o quadro (equipe, dono) ou desenvolve fica de fora da lista.
async function setMembers(c, req, workId, projectId, ids, name, owners = null) {
  let list = [...new Set(ids)];
  if (list.length) {
    const active = await activeIds(c, list);
    if (list.some(id => !active.has(id))) throw new HttpError(400, 'Solicitante não encontrado ou inativo.');
    if (!owners) {
      const { rows } = await c.query('SELECT user_id FROM work_owners WHERE work_id = $1', [workId]);
      owners = rows.map(r => r.user_id);
    }
    const kept = [];
    for (const uid of list) {
      if (owners.includes(uid)) continue;
      const { rows: [r] } = await c.query('SELECT th_project_role($1, $2) AS r', [uid, projectId]);
      if (!['manage', 'edit'].includes(r?.r)) kept.push(uid);
    }
    list = kept;
  }
  const { rows: cur } = await c.query('SELECT user_id FROM work_members WHERE work_id = $1', [workId]);
  const before = new Set(cur.map(r => r.user_id));
  await c.query('DELETE FROM work_members WHERE work_id = $1', [workId]);
  for (const uid of list) {
    await c.query('INSERT INTO work_members (work_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [workId, uid]);
    if (!before.has(uid)) {
      await notify(c, { userId: uid, actorId: req.user.id, type: 'work_added', projectId,
        title: `${req.user.name} colocou você como solicitante de um projeto: você acompanha as fases dele`, body: name });
    }
  }
}

// Responsáveis e solicitantes: quem recebe os avisos de fase e de conclusão.
async function followersOf(c, workId) {
  const { rows } = await c.query(
    `SELECT user_id FROM work_members WHERE work_id = $1
     UNION SELECT user_id FROM work_owners WHERE work_id = $1
     UNION SELECT owner_id FROM project_sections WHERE id = $1 AND owner_id IS NOT NULL`, [workId]
  );
  return rows.map(r => r.user_id);
}

// Projetos de equipe em que a pessoa foi convidada sem ser da equipe (menu "Convidado em").
router.get('/me/guest-works', ah(async (req, res) => {
  const { rows } = await query(
    `SELECT s.id, s.name, s.color, s.project_id, b.team_id, t.name AS team_name, th_project_role($1, s.project_id) AS role
       FROM project_sections s
       JOIN team_boards b ON b.project_id = s.project_id
       JOIN teams t ON t.id = b.team_id
      WHERE s.completed_at IS NULL
        AND (s.owner_id = $1 OR EXISTS (SELECT 1 FROM work_members wm WHERE wm.work_id = s.id AND wm.user_id = $1)
             OR EXISTS (SELECT 1 FROM work_owners wo WHERE wo.work_id = s.id AND wo.user_id = $1))
      ORDER BY s.name`, [req.user.id]
  );
  res.json(rows.filter(r => r.role === 'partial').map(({ role, ...r }) => r));
}));

// Sugestões do campo Departamento do projeto: departamentos das pessoas e os já usados em projetos.
router.get('/departments', ah(async (req, res) => {
  const { rows } = await query(
    `SELECT DISTINCT TRIM(department) AS name FROM users WHERE department IS NOT NULL AND TRIM(department) <> ''
     UNION
     SELECT DISTINCT TRIM(department) AS name FROM work_info WHERE department IS NOT NULL AND TRIM(department) <> ''
     ORDER BY name`, []
  );
  res.json(rows.map(r => r.name));
}));

// Onde a pessoa pode criar tarefa (seletor único da Nova tarefa): projetos abertos, agrupados por equipe.
router.get('/me/creatable-works', ah(async (req, res) => {
  const { rows } = await query(
    `SELECT s.id, s.name, s.color, s.project_id, p.name AS project_name, p.space, b.team_id, t.name AS team_name,
            wp.phase_id, th_work_role($1, s.id) AS my_role
       FROM project_sections s
       JOIN projects p ON p.id = s.project_id AND p.archived = false
       LEFT JOIN team_boards b ON b.project_id = p.id
       LEFT JOIN teams t ON t.id = b.team_id
       LEFT JOIN work_phase wp ON wp.work_id = s.id
      WHERE s.completed_at IS NULL
      ORDER BY COALESCE(t.name, p.name), s.position, s.name`, [req.user.id]
  );
  res.json(rows.filter(r => r.my_role === 'manage').map(({ my_role, ...r }) => r));
}));

router.get('/works/:id', ah(async (req, res) => {
  const id = intParam(req.params.id);
  const role = await requireWork(req.user, id);
  const { rows: [w] } = await query(`${WORK_SELECT} WHERE s.id = $2`, [req.user.id, id]);
  const { rows: [p] } = await query(
    `SELECT p.id, p.name, p.color, p.space, p.team_id, t.sector_id, sc.name AS sector_name, th_project_role($1, p.id) AS my_role
       FROM projects p
       LEFT JOIN teams t ON t.id = p.team_id
       LEFT JOIN sectors sc ON sc.id = t.sector_id
      WHERE p.id = $2`, [req.user.id, w.project_id]
  );
  const { rows: statuses } = role === 'follow' ? { rows: [] } : await query(
    'SELECT * FROM workflow_statuses WHERE project_id = $1 ORDER BY position, id', [w.project_id]
  );
  const phases = await projectPhases({ query }, p.id);
  res.json({
    ...forViewer({ ...w, my_role: role }), project: p, statuses, phases, team_id: p.team_id || null,
    ...(await phaseAccess(req.user, p.id, p.team_id)),
  });
}));

// Histórico de fases do projeto: o que o solicitante acompanha.
router.get('/works/:id/phases-log', ah(async (req, res) => {
  const id = intParam(req.params.id);
  await requireWork(req.user, id);
  const { rows } = await query(
    `SELECT l.id, l.phase_id, ph.name AS phase_name, ph.color AS phase_color, l.changed_at,
            u.id AS changed_by, u.name AS changed_by_name
       FROM work_phase_log l
       JOIN team_phases ph ON ph.id = l.phase_id
       LEFT JOIN users u ON u.id = l.changed_by
      WHERE l.work_id = $1 ORDER BY l.changed_at DESC, l.id DESC`, [id]
  );
  res.json(rows);
}));

// Histórico de datas. O solicitante vê só mudanças de início e pausas, sem as datas de entrega.
router.get('/works/:id/date-log', ah(async (req, res) => {
  const id = intParam(req.params.id);
  const role = await requireWork(req.user, id);
  const { rows } = await query(
    `SELECT l.id, l.kind, l.old_start, l.new_start, l.old_due, l.new_due, l.reason, l.created_at,
            u.id AS created_by, u.name AS created_by_name, c.name AS cause_name
       FROM work_date_log l
       LEFT JOIN users u ON u.id = l.created_by
       LEFT JOIN project_sections c ON c.id = l.cause_work_id
      WHERE l.work_id = $1 ORDER BY l.created_at DESC, l.id DESC`, [id]
  );
  if (role !== 'follow') { res.json(rows); return; }
  res.json(rows
    .filter(r => r.kind === 'pausa' || r.kind === 'criacao' || (r.old_start || null) !== (r.new_start || null))
    .map(r => ({ ...r, old_due: null, new_due: null })));
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
  const d = parse(patchSchema, req.body);
  const { rows: [cur] } = await query(
    `${WORK_SELECT} WHERE s.id = $2`, [req.user.id, id]
  );
  const nextStart = d.start_date !== undefined ? d.start_date : (cur.start_date || null);
  const nextDue = d.due_date !== undefined ? d.due_date : (cur.due_date || null);
  const nextOwners = ownerIdsOf(d) || laneOwners(cur);
  const prevDates = { start: dayOf(cur.start_date) || null, due: dayOf(cur.due_date) || null };
  const firstDates = !prevDates.start && !prevDates.due;
  const manualDates = datesChanged(prevDates, { start: nextStart || null, due: nextDue || null });
  const reason = manualDates && !firstDates ? requireReason(d.date_reason) : null;
  const datesChange = d.start_date !== undefined || d.due_date !== undefined || d.owner_ids !== undefined || d.owner_id !== undefined;
  let impact = null;
  if (datesChange && nextStart && nextDue && nextOwners.length && !d.done) {
    if (nextDue < nextStart) throw new HttpError(400, 'A previsão de entrega deve ser igual ou depois da data inicial.');
    impact = await boardImpact({ query }, req.user.id, cur.project_id, {
      start: nextStart, due: nextDue, owner_ids: nextOwners, exclude_id: id, ...adjustChoice(d),
    });
    if (impact.conflicts.length && !decided(d)) throw conflictError(impact);
  }
  await tx(async (c) => {
    const { rows: [w] } = await c.query('SELECT name, project_id, completed_at FROM project_sections WHERE id = $1', [id]);
    const board = !!(await teamOfBoard(c, w.project_id));
    const sets = []; const params = [];
    for (const k of ['name', 'description', 'due_date', 'color', 'position']) {
      if (d[k] !== undefined) { params.push(d[k]); sets.push(`${k} = $${params.length}`); }
    }
    if (d.done !== undefined) sets.push(d.done ? 'completed_at = NOW()' : 'completed_at = NULL');
    if (sets.length) { params.push(id); await c.query(`UPDATE project_sections SET ${sets.join(', ')} WHERE id = $${params.length}`, params); }
    if (d.start_date !== undefined || d.duration_days !== undefined || d.due_date !== undefined) await saveSchedule(c, id, d);
    const name = d.name || w.name;
    const ownerIds = ownerIdsOf(d);
    const owners = ownerIds ? await setOwners(c, req, id, w.project_id, ownerIds, name, board) : null;
    if (d.members) await setMembers(c, req, id, w.project_id, d.members, name, owners);
    if (d.continues_ids !== undefined) await setLinks(c, id, w.project_id, d.continues_ids);
    if (d.department !== undefined) await saveDepartment(c, id, d.department);
    if (manualDates) {
      const after = await readDates(c, id);
      await setBaseline(c, id, after.start, after.due, req.user.id);
      await logDates(c, { workId: id, kind: firstDates ? 'criacao' : 'manual', before: prevDates, after,
        reason: reason || 'Datas definidas', userId: req.user.id });
      if (!firstDates) await notifyDates(c, { workId: id, kind: 'manual', before: prevDates, after, reason, actor: req.user });
    }
    await applyAdjust(c, req, impact, id, name, w.project_id);
    if (d.done && !w.completed_at) {
      for (const uid of await followersOf(c, id)) {
        await notify(c, { userId: uid, actorId: req.user.id, type: 'work_done', projectId: w.project_id,
          title: `${req.user.name} concluiu o projeto "${name}"`, body: name });
      }
    }
  });
  const { rows } = await query(`${WORK_SELECT} WHERE s.id = $2`, [req.user.id, id]);
  res.json(forViewer(rows[0]));
}));

router.delete('/works/:id', ah(async (req, res) => {
  const id = intParam(req.params.id);
  const { rows: [w] } = await query('SELECT project_id FROM project_sections WHERE id = $1', [id]);
  if (!w) throw new HttpError(404, 'Projeto não encontrado');
  if (!['manage', 'edit'].includes(await projectRole(req.user.id, w.project_id))) {
    throw new HttpError(403, (await teamOfBoard({ query }, w.project_id))
      ? 'Quem exclui projetos é quem participa da equipe.' : 'Quem exclui projetos é quem coordena este quadro.');
  }
  await removeWorkBlobs(id);
  await tx(async (c) => {
    await c.query('DELETE FROM tasks WHERE section_id = $1', [id]);
    await c.query('DELETE FROM project_sections WHERE id = $1', [id]);
  });
  res.json({ ok: true });
}));

// ---- Anexos do projeto --------------------------------------------------------
// Removem também os anexos das tarefas do projeto, que saem junto com ele.
async function removeWorkBlobs(workId) {
  const { rows } = await query(
    `SELECT container, \`blob\` FROM work_files WHERE work_id = $1
     UNION ALL
     SELECT f.container, f.\`blob\` FROM task_files f JOIN tasks t ON t.id = f.task_id WHERE t.section_id = $1`,
    [workId]
  );
  for (const f of rows) {
    try {
      await blobService.removerBlob(f.container, f.blob);
    } catch {
      /* blob ausente não impede excluir o projeto */
    }
  }
}

router.get('/works/:id/files', ah(async (req, res) => {
  const id = intParam(req.params.id);
  await requireWork(req.user, id);
  const { rows } = await query(
    `SELECT f.id, f.name, f.mime, f.size_bytes, f.created_at, f.uploaded_by, u.name AS uploader_name
       FROM work_files f LEFT JOIN users u ON u.id = f.uploaded_by
      WHERE f.work_id = $1 ORDER BY f.id`,
    [id]
  );
  res.json(rows.map(formatFile));
}));

router.post(
  '/works/:id/files',
  uploadTaskFiles.array('files', env.taskhubAnexoMaxFiles),
  handleTaskFilesMulterError,
  ah(async (req, res) => {
    const incoming = Array.isArray(req.files) ? req.files : [];
    try {
      const id = intParam(req.params.id);
      await requireWork(req.user, id, 'manage');
      if (!incoming.length) throw new HttpError(400, 'Envie pelo menos um arquivo.');
      const { rows: [{ n }] } = await query('SELECT COUNT(*)::int AS n FROM work_files WHERE work_id = $1', [id]);
      if (Number(n) + incoming.length > env.taskhubAnexoMaxFiles) {
        throw new HttpError(400, `O projeto pode ter no máximo ${env.taskhubAnexoMaxFiles} arquivos.`);
      }
      const container = await blobService.garantirContainer(env.taskhubContainer);
      const created = [];
      for (const file of incoming) {
        const blob = blobNameFor(file);
        await blobService.enviarArquivo(container, file.path, blob, file.mimetype);
        unlinkQuiet(file.path);
        const { rows: [row] } = await query(
          `INSERT INTO work_files (work_id, uploaded_by, name, mime, size_bytes, container, \`blob\`)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id, name, mime, size_bytes, created_at, uploaded_by`,
          [id, req.user.id, safeOriginalName(file.originalname), file.mimetype || 'application/octet-stream', file.size, container, blob]
        );
        row.uploader_name = req.user.name;
        created.push(formatFile(row));
      }
      res.status(201).json(created);
    } catch (err) {
      incoming.forEach((f) => unlinkQuiet(f.path));
      throw err;
    }
  })
);

router.get('/works/:id/files/:fileId', ah(async (req, res) => {
  const id = intParam(req.params.id);
  const fileId = intParam(req.params.fileId, 'fileId');
  await requireWork(req.user, id);
  const { rows: [row] } = await query(
    'SELECT name, mime, container, `blob` FROM work_files WHERE id = $1 AND work_id = $2',
    [fileId, id]
  );
  if (!row) throw new HttpError(404, 'Arquivo não encontrado.');
  const downloaded = await blobService.baixarBuffer(row.container, row.blob);
  res.setHeader('Content-Type', downloaded.contentType || row.mime || 'application/octet-stream');
  res.setHeader('Content-Disposition', blobService.contentDispositionAttachment(row.name));
  res.send(downloaded.buffer);
}));

router.delete('/works/:id/files/:fileId', ah(async (req, res) => {
  const id = intParam(req.params.id);
  const fileId = intParam(req.params.fileId, 'fileId');
  await requireWork(req.user, id, 'manage');
  const { rows: [row] } = await query(
    'SELECT container, `blob` FROM work_files WHERE id = $1 AND work_id = $2',
    [fileId, id]
  );
  if (!row) throw new HttpError(404, 'Arquivo não encontrado.');
  await blobService.removerBlob(row.container, row.blob);
  await query('DELETE FROM work_files WHERE id = $1', [fileId]);
  res.json({ ok: true });
}));

// work_id continua related_id. Só outros projetos do mesmo quadro.
async function setLinks(c, workId, projectId, ids) {
  const list = [...new Set(ids)].filter(id => id !== workId);
  if (list.length) {
    const { rows } = await c.query(
      'SELECT id FROM project_sections WHERE project_id = $1 AND id = ANY($2)',
      [projectId, list]
    );
    if (rows.length !== list.length) throw new HttpError(400, 'Só dá para relacionar projetos deste quadro.');
  }
  await c.query('DELETE FROM work_links WHERE work_id = $1', [workId]);
  for (const relatedId of list) {
    await c.query(
      'INSERT INTO work_links (work_id, related_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [workId, relatedId]
    );
  }
}

async function timelineData(userId, pid) {
  const { rows: [p] } = await query(
    'SELECT id, start_date, end_date, created_at FROM projects WHERE id = $1', [pid]
  );
  // Os trabalhos são encadeados: o plano usa todos, mesmo os que a pessoa não vê, para as datas não mudarem.
  const { rows: works } = await query(
    `${WORK_SELECT} WHERE s.project_id = $2 ORDER BY s.position, s.id`,
    [userId, pid]
  );
  const start = p.start_date || dayOf(p.created_at);
  const items = works.map(w => ({ ...w, duration_saved: w.duration_days != null, duration_days: estimateDuration(w) }));
  const plan = computeTimeline(items.map(timelineItem), start);
  const ids = items.map(w => w.id);
  const logsByWork = {};
  const baseBy = new Map();
  const pausesBy = {};
  if (ids.length) {
    const { rows: bases } = await query('SELECT work_id, start_date, due_date FROM work_baseline WHERE work_id = ANY($1)', [ids]);
    for (const b of bases) baseBy.set(b.work_id, b);
    const { rows: pz } = await query(
      `SELECT pz.work_id, pz.start_date, pz.end_date, c.name AS cause_name
         FROM work_pauses pz LEFT JOIN project_sections c ON c.id = pz.cause_work_id
        WHERE pz.work_id = ANY($1) ORDER BY pz.work_id, pz.start_date, pz.id`, [ids]
    );
    for (const r of pz) (pausesBy[r.work_id] ||= []).push({ start: r.start_date, end: r.end_date, cause_name: r.cause_name });
    const { rows: logs } = await query(
      `SELECT l.work_id, l.phase_id, ph.name AS phase_name, ph.color AS phase_color, l.changed_at
         FROM work_phase_log l
         JOIN team_phases ph ON ph.id = l.phase_id
        WHERE l.work_id = ANY($1)
        ORDER BY l.work_id, l.changed_at, l.id`,
      [ids]
    );
    for (const row of logs) {
      (logsByWork[row.work_id] ||= []).push({
        phase_id: row.phase_id, phase_name: row.phase_name, phase_color: row.phase_color, changed_at: row.changed_at,
      });
    }
  }
  return {
    project_start: start,
    end_date: p.end_date,
    forecast_end: plan.forecast_end,
    phases: await projectPhases({ query }, pid),
    works: items
      .map((w, i) => ({
        ...w,
        tl_start: plan.rows[i].start, tl_end: plan.rows[i].end, tl_late: plan.rows[i].late,
        phase_log: logsByWork[w.id] || [],
        planned_start: baseBy.has(w.id) ? baseBy.get(w.id).start_date : (w.start_date || null),
        planned_due: baseBy.has(w.id) ? baseBy.get(w.id).due_date : (w.due_date || null),
        pauses: pausesBy[w.id] || [],
      }))
      .filter(w => w.my_role)
      .map(forViewer),
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
  reason: z.string().trim().max(500).optional(),
});

router.put('/projects/:id/timeline', ah(async (req, res) => {
  const pid = intParam(req.params.id);
  const role = await projectRole(req.user.id, pid);
  if (!role) throw new HttpError(404, 'Projeto não encontrado');
  if (!['manage', 'edit'].includes(role)) throw new HttpError(403, 'Quem muda a linha do tempo é quem coordena o projeto.');
  const d = parse(timelineSchema, req.body);

  for (const it of d.items) {
    if (!it.id && !it.name) throw new HttpError(400, 'Informe o nome do novo projeto.');
  }
  const kept = d.items.filter(it => it.id).map(it => it.id);
  const sent = new Set([...kept, ...d.remove]);
  if (sent.size !== kept.length + d.remove.length) throw new HttpError(400, 'Projeto repetido na linha do tempo.');

  const { rows: [p] } = await query('SELECT start_date, created_at FROM projects WHERE id = $1', [pid]);
  await tx(async (c) => {
    const { rows: cur } = await c.query('SELECT id, completed_at FROM project_sections WHERE project_id = $1', [pid]);
    const byId = new Map(cur.map(w => [w.id, w]));
    if (cur.length !== sent.size || [...sent].some(id => !byId.has(id))) {
      throw new HttpError(409, 'Os projetos da linha do tempo mudaram. Recarregue e simule de novo.');
    }

    for (const id of d.remove) {
      await c.query('DELETE FROM tasks WHERE section_id = $1', [id]);
      await c.query('DELETE FROM project_sections WHERE id = $1', [id]);
    }

    const before = new Map();
    for (const it of d.items) if (it.id) before.set(it.id, await readDates(c, it.id));
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
        await c.query('INSERT INTO work_owners (work_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [w.id, req.user.id]);
        await startWorkPhase(c, req, pid, w.id);
        ids.push(w.id);
      }
    }
    const ownersBy = new Map();
    if (ids.length) {
      const { rows: ow } = await c.query('SELECT work_id, user_id FROM work_owners WHERE work_id = ANY($1)', [ids]);
      for (const r of ow) {
        const list = ownersBy.get(r.work_id) || [];
        list.push(r.user_id);
        ownersBy.set(r.work_id, list);
      }
    }
    const plan = computeTimeline(
      d.items.map((it, i) => ({
        duration_days: it.duration_days,
        start_date: it.start_date || null,
        completed_at: byId.get(ids[i])?.completed_at || null,
        owner_ids: ownersBy.get(ids[i]) || [req.user.id],
      })),
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
    // Mudança de data pelo editor é manual: exige motivo e vira o novo planejado.
    let reason = null;
    for (const id of ids) {
      const prev = before.get(id) || null;
      const after = await readDates(c, id);
      const first = !prev || (!prev.start && !prev.due);
      if (prev && !datesChanged(prev, after)) continue;
      if (!first && !reason) reason = requireReason(d.reason);
      await setBaseline(c, id, after.start, after.due, req.user.id);
      await logDates(c, { workId: id, kind: first ? 'criacao' : 'manual', before: prev, after,
        reason: first ? (prev ? 'Datas definidas' : 'Projeto criado') : reason, userId: req.user.id });
      if (!first) await notifyDates(c, { workId: id, kind: 'manual', before: prev, after, reason, actor: req.user });
    }
  });

  res.json({ ...(await timelineData(req.user.id, pid)), can_edit: true });
}));

module.exports = router;
