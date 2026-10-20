const router = require('express').Router();
const { z } = require('zod');
const { query, tx } = require('../db');
const { ah, parse, intParam, HttpError } = require('../lib/http');
const { SIZE_MIN, SPACE_SQL, MINE_SQL, TASK_SELECT, STATUS_CATEGORY_SQL, formatTask, loadTask, logActivity } = require('../lib/tasks');
const { notify, mentionedUserIds } = require('../lib/notify');
const { isoDate, addDays } = require('../lib/dates');
const { projectRole } = require('./projects');

const PRIORITIES = ['critica', 'alta', 'media', 'baixa'];
const PRIORITY_LABEL = { critica: 'Crítica', alta: 'Alta', media: 'Média', baixa: 'Baixa' };
const dateOrNull = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'use AAAA-MM-DD').nullable();

// ---- Listagem ---------------------------------------------------------------
// Filtros: project_id, team_id, assignee (me|id|none), created_by (me), delegated (1),
// status (open|done|todo|doing|blocked|all), due (overdue|today|week|none), q, limit.
router.get('/', ah(async (req, res) => {
  const me = req.user.id;
  const params = [me];
  const where = ['th_task_access($1, t.id) IS NOT NULL'];
  const add = (sql, value) => { params.push(value); where.push(sql.replace('?', `$${params.length}`)); };
  const today = isoDate();

  if (req.query.project_id) add('t.project_id = ?', intParam(req.query.project_id, 'project_id'));
  // Equipe = trabalho das pessoas da equipe (o que eu puder ver).
  if (req.query.team_id) add('t.assignee_id IN (SELECT user_id FROM team_members WHERE team_id = ?)', intParam(req.query.team_id, 'team_id'));
  if (req.query.sector_id) add('t.assignee_id IN (SELECT id FROM users WHERE sector_id = ?)', intParam(req.query.sector_id, 'sector_id'));
  if (req.query.assignee === 'me') where.push(MINE_SQL('$1'));
  else if (req.query.assignee === 'none') where.push('t.assignee_id IS NULL');
  else if (req.query.assignee) add('t.assignee_id = ?', intParam(req.query.assignee, 'assignee'));
  if (req.query.created_by === 'me') where.push('t.created_by = $1');
  if (req.query.delegated === '1') where.push('t.created_by = $1 AND t.assignee_id IS DISTINCT FROM $1');
  if (req.query.q) add('t.title ILIKE ?', `%${String(req.query.q).trim()}%`);
  if (req.query.space === 'pessoal' || req.query.space === 'profissional') add(`${SPACE_SQL} = ?`, req.query.space);
  if (req.query.section_id) add('t.section_id = ?', intParam(req.query.section_id, 'section_id'));
  if (!req.query.project_id) where.push('(p.id IS NULL OR p.archived = false)');

  const status = req.query.status || 'open';
  if (status === 'open') where.push(`${STATUS_CATEGORY_SQL} IN ('todo','doing','blocked')`);
  else if (['todo', 'doing', 'blocked', 'done', 'canceled'].includes(status)) add(`${STATUS_CATEGORY_SQL} = ?`, status);
  else if (status === 'recent') where.push(`(${STATUS_CATEGORY_SQL} IN ('todo','doing','blocked') OR t.completed_at > NOW() - INTERVAL '14 days')`);

  if (req.query.due === 'overdue') add('t.deadline < ?', today);
  else if (req.query.due === 'today') add('t.deadline = ?', today);
  else if (req.query.due === 'week') { add('t.deadline >= ?', today); add('t.deadline <= ?', addDays(today, 7)); }
  else if (req.query.due === 'none') where.push('t.deadline IS NULL');

  const limit = Math.min(Number(req.query.limit) || 500, 1000);
  const { rows } = await query(
    `${TASK_SELECT} WHERE ${where.join(' AND ')}
     ORDER BY ws.position NULLS LAST, t.position, t.deadline NULLS LAST, t.id
     LIMIT ${limit}`,
    params
  );
  res.json(rows.map(formatTask));
}));

// ---- Detalhe ----------------------------------------------------------------
router.get('/:id', ah(async (req, res) => {
  const id = intParam(req.params.id);
  const task = await loadTask({ query }, req.user.id, id);
  if (!task) throw new HttpError(404, 'Tarefa não encontrada');
  const { rows: subtasks } = await query(
    `SELECT s.id, s.title, s.done, s.position, s.due_date, s.assignee_id,
            u.name AS assignee_name, u.initials AS assignee_initials, u.color AS assignee_color, tm_t.name AS assignee_team
       FROM subtasks s
       LEFT JOIN users u ON u.id = s.assignee_id
       LEFT JOIN team_members tm ON tm.user_id = u.id
       LEFT JOIN teams tm_t ON tm_t.id = tm.team_id
      WHERE s.task_id = $1 ORDER BY s.position, s.id`, [id]
  );
  let statuses = []; let sections = [];
  if (task.project) {
    ({ rows: statuses } = await query('SELECT * FROM workflow_statuses WHERE project_id = $1 ORDER BY position, id', [task.project.id]));
    ({ rows: sections } = await query('SELECT * FROM project_sections WHERE project_id = $1 ORDER BY position, id', [task.project.id]));
  }
  res.json({ ...task, subtasks, statuses, sections });
}));

// ---- Criação ----------------------------------------------------------------
const createSchema = z.object({
  title: z.string().trim().min(1, 'informe um título').max(300),
  description: z.string().max(20000).default(''),
  project_id: z.coerce.number().int().positive().nullable().optional(),
  section_id: z.coerce.number().int().positive().nullable().optional(),
  status_id: z.coerce.number().int().positive().nullable().optional(),
  assignee_id: z.coerce.number().int().positive().nullable().optional(),
  priority: z.enum(PRIORITIES).default('media'),
  due_date: dateOrNull.optional(),
  start_date: dateOrNull.optional(),
  estimate_min: z.coerce.number().int().min(0).max(100000).nullable().optional(),
  size: z.enum(['P', 'M', 'G']).nullable().optional(),
  is_private: z.boolean().default(false),
  show_to_manager: z.boolean().default(false),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  subtasks: z.array(z.string().trim().min(1).max(500)).max(100).default([]),
  plan_today: z.boolean().default(false),
  plan_period: z.enum(['manha', 'tarde', 'fim']).optional(),
  space: z.enum(['profissional', 'pessoal']).default('profissional'),
});

async function firstStatus(run, projectId, category = 'todo') {
  const { rows } = await run.query(
    'SELECT * FROM workflow_statuses WHERE project_id = $1 AND category = $2 ORDER BY position, id LIMIT 1',
    [projectId, category]
  );
  return rows[0] || null;
}

// Pode ser responsável qualquer pessoa ativa da empresa: quem é de outro setor
// passa a ver apenas esta tarefa, não o projeto. Contas "convidado" só dentro do próprio projeto.
async function assertAssignable(run, projectId, assigneeId, me) {
  if (!assigneeId) return;
  if (!projectId) {
    const { rows: [u] } = await run.query('SELECT role, active FROM users WHERE id = $1', [assigneeId]);
    if (!u || u.active === false) throw new HttpError(400, 'Pessoa não encontrada ou desativada.');
    if (u.role === 'convidado') throw new HttpError(400, 'Contas de convidado só recebem tarefas de projetos.');
    return;
  }
  const { rows } = await run.query(
    'SELECT role, active, th_project_role(id, $2) AS prole FROM users WHERE id = $1', [assigneeId, projectId]
  );
  const u = rows[0];
  if (!u || u.active === false) throw new HttpError(400, 'Pessoa não encontrada ou desativada.');
  if (u.role === 'convidado' && !u.prole) throw new HttpError(400, 'Contas de convidado só recebem tarefas dos projetos em que foram incluídas.');
}

router.post('/', ah(async (req, res) => {
  const d = parse(createSchema, req.body);
  const me = req.user.id;
  const projectId = d.project_id || null;
  let space = d.space;

  if (projectId) {
    const role = await projectRole(me, projectId);
    if (!role) throw new HttpError(404, 'Projeto não encontrado');
    // Toda tarefa de projeto fica dentro de um trabalho.
    if (!d.section_id) throw new HttpError(422, 'Escolha o trabalho da tarefa.', [{ campo: 'section_id', mensagem: 'obrigatório' }]);
    const { rows: [wk] } = await query('SELECT project_id, th_work_role($1, id) AS role FROM project_sections WHERE id = $2', [me, d.section_id]);
    if (!wk || wk.project_id !== projectId) throw new HttpError(422, 'Esse trabalho não é deste projeto.');
    // Cria quem coordena o projeto ou quem é responsável pelo trabalho.
    if (!['edit', 'manage'].includes(role) && wk.role !== 'manage') throw new HttpError(403, 'Neste trabalho quem cria tarefas é quem coordena o projeto ou o responsável pelo trabalho.');
    space = (await query('SELECT space FROM projects WHERE id = $1', [projectId])).rows[0].space;
  } else if (space === 'profissional' && !req.user.is_manager) {
    throw new HttpError(403, 'No espaço Corporativo quem cria tarefas é o gestor. Use o espaço Individual para as suas.');
  }
  let assigneeId = d.assignee_id === undefined ? (projectId ? null : me) : d.assignee_id;
  // Pessoal: só a própria pessoa.
  if (space === 'pessoal') {
    if (assigneeId && assigneeId !== me) throw new HttpError(400, 'Tarefas individuais ficam com você. Para atribuir a alguém, crie no espaço Corporativo.');
    assigneeId = me;
  }
  await assertAssignable({ query }, projectId, assigneeId, me);

  const id = await tx(async (c) => {
    let statusId = null; let category = 'todo';
    if (projectId) {
      let status = null;
      if (d.status_id) {
        ({ rows: [status] } = await c.query('SELECT * FROM workflow_statuses WHERE id = $1 AND project_id = $2', [d.status_id, projectId]));
      }
      status = status || await firstStatus(c, projectId);
      statusId = status?.id || null; category = status?.category || 'todo';
    }
    const { rows: [pos] } = await c.query(
      'SELECT COALESCE(MAX(position), 0) + 1000 AS p FROM tasks WHERE project_id IS NOT DISTINCT FROM $1', [projectId]
    );
    const { rows: [t] } = await c.query(
      `INSERT INTO tasks (user_id, title, notes, project_id, section_id, status_id, assignee_id, created_by, priority,
                          deadline, start_date, estimate_min, is_private, tags, position, completed_at, space, size)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $1, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) RETURNING id`,
      [me, d.title, d.description, projectId, d.section_id || null, statusId, assigneeId, d.priority,
        d.due_date || null, d.start_date || null, d.estimate_min ?? (d.size ? SIZE_MIN[d.size] : null), d.is_private, d.tags, pos.p,
        category === 'done' ? new Date() : null, space, d.size || null]
    );
    for (let i = 0; i < d.subtasks.length; i++) {
      await c.query('INSERT INTO subtasks (task_id, title, position) VALUES ($1, $2, $3)', [t.id, d.subtasks[i], i]);
    }
    await logActivity(c, t.id, me, 'created');
    if (assigneeId && assigneeId !== me) {
      await notify(c, {
        userId: assigneeId, actorId: me, type: 'assigned', taskId: t.id, projectId,
        title: `${req.user.name} atribuiu uma tarefa a você`, body: d.title,
      });
    }
    if (d.plan_today && assigneeId === me) {
      const planDate = isoDate();
      const { rows: [planPos] } = await c.query(
        'SELECT COALESCE(MAX(position), 0) + 1 AS n FROM day_plan_items WHERE user_id = $1 AND plan_date = $2',
        [me, planDate]
      );
      await c.query(
        `INSERT INTO day_plan_items (user_id, plan_date, task_id, position, period)
         VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
        [me, planDate, t.id, planPos.n, d.plan_period || (() => { const h = new Date().getHours(); return h < 12 ? 'manha' : h < 17 ? 'tarde' : 'fim'; })()]
      );
    }
    return t.id;
  });
  res.status(201).json(await loadTask({ query }, me, id));
}));

// ---- Atualização ------------------------------------------------------------
const updateSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  description: z.string().max(20000).optional(),
  project_id: z.coerce.number().int().positive().nullable().optional(),
  section_id: z.coerce.number().int().positive().nullable().optional(),
  status_id: z.coerce.number().int().positive().optional(),
  done: z.boolean().optional(),
  assignee_id: z.coerce.number().int().positive().nullable().optional(),
  priority: z.enum(PRIORITIES).optional(),
  due_date: dateOrNull.optional(),
  start_date: dateOrNull.optional(),
  estimate_min: z.coerce.number().int().min(0).max(100000).nullable().optional(),
  size: z.enum(['P', 'M', 'G']).nullable().optional(),
  is_private: z.boolean().optional(),
  show_to_manager: z.boolean().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  blocked_reason: z.string().trim().max(1000).nullable().optional(),
  position: z.number().optional(),
});

async function requireTaskEdit(userId, taskId, allowWork = false) {
  const { rows } = await query(
    `SELECT t.*, th_task_access($1, t.id) AS access, ws.category AS category, ws.name AS status_name,
            COALESCE(pp.space, t.space) AS eff_space
       FROM tasks t LEFT JOIN workflow_statuses ws ON ws.id = t.status_id LEFT JOIN projects pp ON pp.id = t.project_id
      WHERE t.id = $2`,
    [userId, taskId]
  );
  const t = rows[0];
  if (!t || !t.access) throw new HttpError(404, 'Tarefa não encontrada');
  if (t.access !== 'edit' && !(allowWork && t.access === 'work')) {
    throw new HttpError(403, t.access === 'work' ? 'Você pode atualizar o status e comentar; o restante quem altera é o gestor.' : 'Você só pode comentar nesta tarefa.');
  }
  return t;
}

// O que o colaborador (acesso "work") pode mudar na tarefa que está com ele.
const WORK_FIELDS = new Set(['status_id', 'done', 'blocked_reason', 'estimate_min', 'size', 'position']);

router.patch('/:id', ah(async (req, res) => {
  const id = intParam(req.params.id);
  const me = req.user.id;
  const d = parse(updateSchema, req.body);
  const cur = await requireTaskEdit(me, id, true);
  if (cur.access === 'work') {
    const blocked = Object.keys(d).filter(k => !WORK_FIELDS.has(k));
    if (blocked.length) throw new HttpError(403, 'Você pode atualizar o status, o tamanho e o bloqueio; o restante quem altera é o gestor.');
  }
  if (cur.eff_space === 'pessoal' && d.assignee_id && d.assignee_id !== me) {
    throw new HttpError(400, 'Tarefas individuais ficam com você.');
  }

  await tx(async (c) => {
    const sets = []; const params = [];
    const set = (col, val) => { params.push(val); sets.push(`${col} = $${params.length}`); };

    let projectId = cur.project_id;
    if (d.project_id !== undefined && d.project_id !== cur.project_id) {
      if (d.project_id) {
        const role = await projectRole(me, d.project_id);
        if (!['edit', 'manage'].includes(role)) throw new HttpError(403, 'Você não pode mover tarefas para esse projeto.');
        const { rows: [np] } = await c.query('SELECT space FROM projects WHERE id = $1', [d.project_id]);
        if (np.space !== cur.eff_space) throw new HttpError(400, 'Não dá para mover entre os espaços Individual e Corporativo.');
      }
      if (!d.project_id) set('space', cur.eff_space);
      projectId = d.project_id;
      set('project_id', projectId);
      // Mudou de projeto: precisa dizer em qual trabalho do novo projeto ela entra.
      if (projectId && !d.section_id) throw new HttpError(422, 'Escolha o trabalho do novo projeto.', [{ campo: 'section_id', mensagem: 'obrigatório' }]);
      if (projectId && d.section_id) {
        const { rows: [wk] } = await c.query('SELECT project_id FROM project_sections WHERE id = $1', [d.section_id]);
        if (!wk || wk.project_id !== projectId) throw new HttpError(422, 'Esse trabalho não é deste projeto.');
      }
      set('section_id', projectId ? d.section_id : null);
      const st = projectId ? await firstStatus(c, projectId, cur.category === 'done' ? 'done' : 'todo') : null;
      set('status_id', st?.id || null);
      const { rows: [pf] } = await c.query('SELECT name FROM projects WHERE id = $1', [projectId]);
      await logActivity(c, id, me, 'project_changed', null, pf?.name || 'Sem projeto');
    }

    // Status: por id (quadro/lista) ou atalho done=true/false.
    let newStatus = null;
    if (d.status_id && d.status_id !== cur.status_id && projectId) {
      ({ rows: [newStatus] } = await c.query('SELECT * FROM workflow_statuses WHERE id = $1 AND project_id = $2', [d.status_id, projectId]));
      if (!newStatus) throw new HttpError(400, 'Status inválido para este projeto.');
    } else if (d.done !== undefined && projectId) {
      const wantDone = d.done;
      if (wantDone !== (cur.category === 'done')) newStatus = await firstStatus(c, projectId, wantDone ? 'done' : 'todo');
    }
    if (newStatus) {
      set('status_id', newStatus.id);
      if (newStatus.category === 'done' && cur.category !== 'done') set('completed_at', new Date());
      if (newStatus.category !== 'done') set('completed_at', null);
      if (newStatus.category !== 'blocked' && d.blocked_reason === undefined) set('blocked_reason', null);
      await logActivity(c, id, me, 'status_changed', cur.status_name, newStatus.name);
    } else if (d.done !== undefined && !projectId) {
      set('completed_at', d.done ? new Date() : null);
      await logActivity(c, id, me, 'status_changed', d.done ? 'A fazer' : 'Concluído', d.done ? 'Concluído' : 'A fazer');
    }

    if (d.title !== undefined && d.title !== cur.title) { set('title', d.title); await logActivity(c, id, me, 'title_changed', cur.title, d.title); }
    if (d.description !== undefined) set('notes', d.description);
    if (d.section_id !== undefined && d.project_id === undefined) {
      if (projectId && !d.section_id) throw new HttpError(422, 'A tarefa precisa ficar em um trabalho.');
      if (d.section_id) {
        const { rows: [wk] } = await c.query('SELECT project_id FROM project_sections WHERE id = $1', [d.section_id]);
        if (!wk || wk.project_id !== projectId) throw new HttpError(422, 'Esse trabalho não é deste projeto.');
      }
      set('section_id', d.section_id);
    }
    if (d.priority !== undefined && d.priority !== cur.priority) {
      set('priority', d.priority); await logActivity(c, id, me, 'priority_changed', PRIORITY_LABEL[cur.priority], PRIORITY_LABEL[d.priority]);
    }
    if (d.due_date !== undefined && d.due_date !== cur.deadline) {
      set('deadline', d.due_date); await logActivity(c, id, me, 'due_changed', cur.deadline, d.due_date);
    }
    if (d.start_date !== undefined) set('start_date', d.start_date);
    if (d.estimate_min !== undefined) set('estimate_min', d.estimate_min);
    // Definir o tamanho também atualiza a estimativa equivalente usada na carga.
    if (d.size !== undefined) { set('size', d.size); if (d.estimate_min === undefined) set('estimate_min', d.size ? SIZE_MIN[d.size] : null); }
    if (d.is_private !== undefined) set('is_private', d.is_private);
    if (d.show_to_manager !== undefined) set('show_to_manager', d.show_to_manager);
    if (d.tags !== undefined) set('tags', d.tags);
    if (d.blocked_reason !== undefined) set('blocked_reason', d.blocked_reason || null);
    if (d.position !== undefined) set('position', d.position);

    let assigneeChanged = false;
    if (d.assignee_id !== undefined && d.assignee_id !== cur.assignee_id) {
      await assertAssignable(c, projectId, d.assignee_id, me);
      set('assignee_id', d.assignee_id);
      assigneeChanged = true;
      const { rows: names } = await c.query('SELECT id, name FROM users WHERE id = ANY($1)', [[cur.assignee_id, d.assignee_id].filter(Boolean)]);
      const nameOf = (uid) => names.find(n => n.id === uid)?.name || 'Ninguém';
      await logActivity(c, id, me, 'assignee_changed', nameOf(cur.assignee_id), nameOf(d.assignee_id));
    }

    if (!sets.length) return;
    params.push(id);
    await c.query(`UPDATE tasks SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${params.length}`, params);

    // Notificações
    const title = d.title || cur.title;
    if (assigneeChanged && d.assignee_id) {
      await notify(c, { userId: d.assignee_id, actorId: me, type: 'assigned', taskId: id, projectId,
        title: `${req.user.name} atribuiu uma tarefa a você`, body: title });
    }
    if (newStatus?.category === 'done' && cur.created_by && cur.created_by !== me) {
      await notify(c, { userId: cur.created_by, actorId: me, type: 'completed', taskId: id, projectId,
        title: `${req.user.name} concluiu uma tarefa que você criou`, body: title });
    }
    if (newStatus?.category === 'blocked') {
      const targets = new Set([cur.created_by].filter(Boolean));
      const { rows: [proj] } = await c.query('SELECT owner_id FROM projects WHERE id = $1', [projectId]);
      if (proj?.owner_id) targets.add(proj.owner_id);
      for (const uid of targets) {
        await notify(c, { userId: uid, actorId: me, type: 'blocked', taskId: id, projectId,
          title: `${req.user.name} marcou uma tarefa como bloqueada`,
          body: d.blocked_reason ? `${title} — ${d.blocked_reason}` : title });
      }
    }
  });

  res.json(await loadTask({ query }, me, id));
}));

router.delete('/:id', ah(async (req, res) => {
  const id = intParam(req.params.id);
  await requireTaskEdit(req.user.id, id);
  await query('DELETE FROM tasks WHERE id = $1', [id]);
  res.json({ ok: true });
}));

// ---- Subtarefas (etapas) ------------------------------------------------------
// Cada etapa pode ter responsável e prazo próprios, inclusive de outro setor.
const SUB_FIELDS = 'id, title, done, position, due_date, assignee_id';

async function notifyStep(c, req, task, sub, assigneeId) {
  if (!assigneeId) return;
  await notify(c, {
    userId: assigneeId, actorId: req.user.id, type: 'step_assigned', taskId: task.id, projectId: task.project_id,
    title: `${req.user.name} pediu sua participação em uma tarefa`, body: `${task.title} — etapa: ${sub.title}`,
  });
}

const subSchema = z.object({
  title: z.string().trim().min(1).max(500).optional(),
  done: z.boolean().optional(),
  assignee_id: z.coerce.number().int().positive().nullable().optional(),
  due_date: dateOrNull.optional(),
});

router.post('/:id/subtasks', ah(async (req, res) => {
  const id = intParam(req.params.id);
  const task = await requireTaskEdit(req.user.id, id);
  const d = parse(subSchema.extend({ title: z.string().trim().min(1).max(500) }), req.body);
  if (d.assignee_id) await assertAssignable({ query }, task.project_id, d.assignee_id, req.user.id);
  const sub = await tx(async (c) => {
    const { rows: [pos] } = await c.query(
      'SELECT COALESCE(MAX(position), -1) + 1 AS n FROM subtasks WHERE task_id = $1', [id]
    );
    const { rows: [row] } = await c.query(
      `INSERT INTO subtasks (task_id, title, position, assignee_id, due_date)
       VALUES ($1, $2, $3, $4, $5) RETURNING ${SUB_FIELDS}`,
      [id, d.title, pos.n, d.assignee_id || null, d.due_date || null]
    );
    await notifyStep(c, req, task, row, d.assignee_id);
    return row;
  });
  res.status(201).json(sub);
}));

router.patch('/:id/subtasks/:subId', ah(async (req, res) => {
  const id = intParam(req.params.id);
  const subId = intParam(req.params.subId, 'subId');
  const d = parse(subSchema, req.body);
  const { rows: [cur] } = await query(
    `SELECT s.*, th_task_access($1, s.task_id) AS access FROM subtasks s WHERE s.id = $2 AND s.task_id = $3`,
    [req.user.id, subId, id]
  );
  if (!cur || !cur.access) throw new HttpError(404, 'Etapa não encontrada');
  const onlyDone = Object.keys(d).every(k => k === 'done');
  // Quem é responsável pela etapa (ou pela tarefa, como colaborador) pode concluí-la.
  if (cur.access !== 'edit' && !(onlyDone && (cur.assignee_id === req.user.id || cur.access === 'work'))) {
    throw new HttpError(403, 'Você só pode concluir as etapas que estão com você.');
  }
  const { rows: [task] } = await query('SELECT id, title, project_id, created_by, assignee_id FROM tasks WHERE id = $1', [id]);
  if (d.assignee_id !== undefined && d.assignee_id !== cur.assignee_id) await assertAssignable({ query }, task.project_id, d.assignee_id, req.user.id);

  const sub = await tx(async (c) => {
    const { rows: [row] } = await c.query(
      `UPDATE subtasks SET title = COALESCE($1, title), done = COALESCE($2, done),
              assignee_id = CASE WHEN $3 THEN $4::int ELSE assignee_id END,
              due_date = CASE WHEN $5 THEN $6::date ELSE due_date END
        WHERE id = $7 RETURNING ${SUB_FIELDS}`,
      [d.title ?? null, d.done ?? null, d.assignee_id !== undefined, d.assignee_id ?? null,
        d.due_date !== undefined, d.due_date ?? null, subId]
    );
    if (d.assignee_id !== undefined && d.assignee_id !== cur.assignee_id) await notifyStep(c, req, task, row, d.assignee_id);
    // Etapa concluída por alguém de fora: avisa o responsável pela tarefa.
    if (d.done === true && !cur.done && cur.assignee_id === req.user.id) {
      for (const uid of new Set([task.assignee_id, task.created_by].filter(Boolean))) {
        await notify(c, { userId: uid, actorId: req.user.id, type: 'step_done', taskId: id, projectId: task.project_id,
          title: `${req.user.name} concluiu uma etapa`, body: `${task.title} — etapa: ${row.title}` });
      }
      await logActivity(c, id, req.user.id, 'step_done', null, row.title);
    }
    return row;
  });
  res.json(sub);
}));

router.delete('/:id/subtasks/:subId', ah(async (req, res) => {
  const id = intParam(req.params.id);
  await requireTaskEdit(req.user.id, id);
  await query('DELETE FROM subtasks WHERE id = $1 AND task_id = $2', [intParam(req.params.subId, 'subId'), id]);
  res.json({ ok: true });
}));

// ---- Comentários e histórico ------------------------------------------------
router.get('/:id/timeline', ah(async (req, res) => {
  const id = intParam(req.params.id);
  const task = await loadTask({ query }, req.user.id, id);
  if (!task) throw new HttpError(404, 'Tarefa não encontrada');
  const { rows } = await query(
    `SELECT 'activity' AS kind, a.id, a.type, a.from_value, a.to_value, NULL AS body,
            u.id AS user_id, u.name AS user_name, u.initials, u.color, a.created_at
       FROM task_activity a LEFT JOIN users u ON u.id = a.user_id WHERE a.task_id = $1
     UNION ALL
     SELECT 'comment', c.id, NULL, NULL, NULL, c.body, u.id, u.name, u.initials, u.color, c.created_at
       FROM task_comments c LEFT JOIN users u ON u.id = c.user_id WHERE c.task_id = $1
     ORDER BY created_at ASC`,
    [id]
  );
  res.json(rows);
}));

router.post('/:id/comments', ah(async (req, res) => {
  const id = intParam(req.params.id);
  const me = req.user.id;
  const task = await loadTask({ query }, me, id);
  if (!task) throw new HttpError(404, 'Tarefa não encontrada');
  const { body } = parse(z.object({ body: z.string().trim().min(1, 'escreva um comentário').max(10000) }), req.body);

  const comment = await tx(async (c) => {
    const { rows: [row] } = await c.query(
      'INSERT INTO task_comments (task_id, user_id, body) VALUES ($1, $2, $3) RETURNING *', [id, me, body]
    );
    const mentioned = await mentionedUserIds(c, body);
    const notified = new Set([me]);
    for (const uid of mentioned) {
      const { rows } = await c.query('SELECT th_task_access($1, $2) AS a', [uid, id]);
      if (!rows[0]?.a) continue; // não avisa quem não pode ver a tarefa
      await notify(c, { userId: uid, actorId: me, type: 'mention', taskId: id, projectId: task.project?.id,
        title: `${req.user.name} mencionou você`, body: `${task.title}: ${body.slice(0, 200)}` });
      notified.add(uid);
    }
    for (const uid of [task.assignee?.id, task.created_by?.id]) {
      if (!uid || notified.has(uid)) continue;
      await notify(c, { userId: uid, actorId: me, type: 'comment', taskId: id, projectId: task.project?.id,
        title: `${req.user.name} comentou em uma tarefa`, body: `${task.title}: ${body.slice(0, 200)}` });
      notified.add(uid);
    }
    return row;
  });
  res.status(201).json({
    kind: 'comment', id: comment.id, body: comment.body, created_at: comment.created_at,
    user_id: me, user_name: req.user.name, initials: req.user.initials, color: req.user.color,
  });
}));

module.exports = router;
