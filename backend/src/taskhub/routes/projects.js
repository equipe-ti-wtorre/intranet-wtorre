const router = require('express').Router();
const { z } = require('zod');
const { query, tx } = require('../db');
const { ah, parse, intParam, HttpError } = require('../lib/http');
const { createDefaultStatuses } = require('../lib/projects');
const { notify } = require('../lib/notify');

// partial = participa só de algum trabalho do projeto (vê o projeto e só esses trabalhos).
const ROLE_RANK = { partial: 0.5, guest: 1, view: 2, edit: 3, manage: 4 };

async function projectRole(userId, projectId) {
  const { rows } = await query('SELECT th_project_role($1, $2) AS role', [userId, projectId]);
  return rows[0]?.role || null;
}

async function requireProject(user, projectId, min = 'view') {
  const role = await projectRole(user.id, projectId);
  if (!role) throw new HttpError(404, 'Projeto não encontrado');
  if (ROLE_RANK[role] < ROLE_RANK[min]) {
    throw new HttpError(403, min === 'manage'
      ? 'Apenas o dono do projeto pode fazer isso.'
      : 'Você só acompanha este projeto; peça ao dono para incluí-lo como editor.');
  }
  return role;
}

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable();

const projectSchema = z.object({
  name: z.string().trim().min(2).max(150),
  description: z.string().max(5000).default(''),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#c9a84c'),
  start_date: date.optional(),
  end_date: date.optional(),
  space: z.enum(['profissional', 'pessoal']).default('profissional'),
  members: z.array(z.object({ user_id: z.coerce.number().int().positive(), role: z.enum(['editor', 'leitor']).default('leitor') })).max(200).default([]),
  team_id: z.coerce.number().int().positive().optional(),
});

const ownerTeam = async (run, userId) =>
  (await run.query('SELECT team_id FROM team_members WHERE user_id = $1 LIMIT 1', [userId])).rows[0]?.team_id || null;

router.get('/', ah(async (req, res) => {
  const params = [req.user.id];
  let where = `th_project_role($1, p.id) IS NOT NULL`;
  if (req.query.team_id) { params.push(intParam(req.query.team_id, 'team_id')); where += ` AND p.team_id = $${params.length}`; }
  if (req.query.archived !== '1') where += ' AND p.archived = false';
  if (req.query.space === 'pessoal' || req.query.space === 'profissional') { params.push(req.query.space); where += ` AND p.space = $${params.length}`; }
  const { rows } = await query(
    `SELECT p.*, t.name AS team_name, t.sector_id, s.name AS sector_name, o.name AS owner_name, th_project_role($1, p.id) AS my_role,
            (SELECT COUNT(*) FROM project_members pm WHERE pm.project_id = p.id) AS members_count,
            EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = $1) AS is_member,
            COUNT(tk.id) FILTER (WHERE ws.category IN ('todo','doing','blocked')) AS open_count,
            COUNT(tk.id) FILTER (WHERE ws.category IN ('todo','doing','blocked') AND tk.deadline < CURRENT_DATE) AS overdue_count,
            COUNT(tk.id) FILTER (WHERE ws.category = 'done') AS done_count,
            COUNT(tk.id) FILTER (WHERE ws.category <> 'canceled') AS total_count
       FROM projects p
       LEFT JOIN teams t ON t.id = p.team_id
       LEFT JOIN sectors s ON s.id = t.sector_id
       LEFT JOIN users o ON o.id = p.owner_id
       LEFT JOIN tasks tk ON tk.project_id = p.id
       LEFT JOIN workflow_statuses ws ON ws.id = tk.status_id
      WHERE ${where}
      GROUP BY p.id, t.name, t.sector_id, s.name, o.name
      ORDER BY p.name`,
    params
  );
  res.json(rows);
}));

// Qualquer pessoa cria projetos (exceto contas de convidado) e inclui quem quiser.
router.post('/', ah(async (req, res) => {
  const d = parse(projectSchema, req.body);
  if (req.user.role === 'convidado') throw new HttpError(403, 'Contas de convidado não criam projetos.');
  if (d.space === 'profissional' && !req.user.is_manager) {
    throw new HttpError(403, 'Projetos corporativos são criados pelo gestor. Você pode criar projetos no espaço Individual.');
  }
  if (d.space === 'pessoal') d.members = [];
  const project = await tx(async (client) => {
    let teamId = await ownerTeam(client, req.user.id);
    if (d.team_id && d.space === 'profissional') {
      const { rows: [team] } = await client.query('SELECT id FROM teams WHERE id = $1 AND archived = false', [d.team_id]);
      if (!team) throw new HttpError(404, 'Equipe não encontrada.');
      const { rows: [ok] } = await client.query('SELECT th_oversees_team($1, $2) AS ok', [req.user.id, d.team_id]);
      if (!ok.ok) throw new HttpError(403, 'Você não acompanha esta equipe.');
      teamId = d.team_id;
    }
    const { rows: [p] } = await client.query(
      `INSERT INTO projects (team_id, name, description, color, visibility, start_date, end_date, owner_id, created_by, space)
       VALUES ($1, $2, $3, $4, 'privado', $5, $6, $7, $7, $8) RETURNING *`,
      [teamId, d.name, d.description, d.color, d.start_date || null, d.end_date || null,
        req.user.id, d.space]
    );
    await client.query(`INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'editor')`, [p.id, req.user.id]);
    for (const m of d.members.filter(m => m.user_id !== req.user.id)) {
      const { rows: [mgr] } = await client.query('SELECT th_is_manager($1) AS ok', [m.user_id]);
      const role = m.role === 'editor' && mgr.ok ? 'editor' : 'leitor';
      await client.query(
        `INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [p.id, m.user_id, role]
      );
      await notify(client, { userId: m.user_id, actorId: req.user.id, type: 'project_added', projectId: p.id,
        title: `${req.user.name} incluiu você em um projeto`, body: p.name });
    }
    await createDefaultStatuses(client, p.id);
    return p;
  });
  res.status(201).json(project);
}));

router.get('/:id', ah(async (req, res) => {
  const id = intParam(req.params.id);
  const role = await requireProject(req.user, id, 'partial');
  const { rows: [project] } = await query(
    `SELECT p.*, t.name AS team_name, t.sector_id, s.name AS sector_name, o.name AS owner_name
       FROM projects p
       LEFT JOIN teams t ON t.id = p.team_id
       LEFT JOIN sectors s ON s.id = t.sector_id
       LEFT JOIN users o ON o.id = p.owner_id
      WHERE p.id = $1`, [id]
  );
  const [{ rows: statuses }, { rows: sections }, { rows: members }] = await Promise.all([
    query('SELECT * FROM workflow_statuses WHERE project_id = $1 ORDER BY position, id', [id]),
    query('SELECT * FROM project_sections WHERE project_id = $1 ORDER BY position, id', [id]),
    query(
      `SELECT u.id, u.name, u.username, u.initials, u.color, pm.role, th_is_manager(u.id) AS can_coordinate, t.name AS team_name
         FROM project_members pm JOIN users u ON u.id = pm.user_id
         LEFT JOIN team_members tm ON tm.user_id = u.id LEFT JOIN teams t ON t.id = tm.team_id
        WHERE pm.project_id = $1 ORDER BY u.name`, [id]
    ),
  ]);
  res.json({ ...project, my_role: role, statuses, sections, members });
}));

// Pessoas que podem receber tarefas deste projeto: quem participa primeiro (in_team = true),
// depois o resto da empresa. Quem recebe uma tarefa passa a ver só aquela tarefa.
router.get('/:id/people', ah(async (req, res) => {
  const id = intParam(req.params.id);
  await requireProject(req.user, id, 'partial');
  const { rows } = await query(
    `SELECT u.id, u.name, u.username, u.initials, u.color, u.job_title, u.away_until,
            t.id AS team_id, t.name AS team_name,
            EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = $1 AND pm.user_id = u.id) AS in_team
       FROM users u
       LEFT JOIN team_members tm ON tm.user_id = u.id
       LEFT JOIN teams t ON t.id = tm.team_id
      WHERE u.active IS DISTINCT FROM false
        AND (u.role <> 'convidado' OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = $1 AND pm.user_id = u.id))
      ORDER BY in_team DESC, u.name`, [id]
  );
  res.json(rows);
}));

router.patch('/:id', ah(async (req, res) => {
  const id = intParam(req.params.id);
  await requireProject(req.user, id, 'manage');
  const d = parse(projectSchema.omit({ members: true, space: true }).partial().extend({
    health: z.enum(['no_prazo', 'em_risco', 'atrasado']).optional(),
    archived: z.boolean().optional(),
    owner_id: z.coerce.number().int().positive().optional(),
  }), req.body);
  // Passar a posse: o novo dono vira participante. A equipe só muda se a tela não escolheu o setor.
  if (d.owner_id) {
    const { rows: [mgr] } = await query('SELECT th_is_manager($1) AS ok', [d.owner_id]);
    if (!mgr.ok) throw new HttpError(400, 'O responsável do projeto precisa poder criar no Corporativo.');
    await query(`INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'editor')
                 ON CONFLICT (project_id, user_id) DO UPDATE SET role = 'editor'`, [id, d.owner_id]);
    if (d.team_id === undefined) d.team_id = await ownerTeam({ query }, d.owner_id);
  }
  if (d.team_id !== undefined) {
    const { rows: [team] } = await query('SELECT id FROM teams WHERE id = $1 AND archived = false', [d.team_id]);
    if (!team) throw new HttpError(404, 'Equipe não encontrada.');
    const { rows: [ok] } = await query('SELECT th_oversees_team($1, $2) AS ok', [req.user.id, d.team_id]);
    if (!ok.ok) throw new HttpError(403, 'Você não acompanha esta equipe.');
  }
  const sets = []; const params = [];
  for (const [k, v] of Object.entries(d)) { params.push(v); sets.push(`${k} = $${params.length}`); }
  if (!sets.length) throw new HttpError(400, 'Nada para atualizar.');
  params.push(id);
  const { rows } = await query(
    `UPDATE projects SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${params.length} RETURNING *`, params
  );
  res.json(rows[0]);
}));

router.delete('/:id', ah(async (req, res) => {
  const id = intParam(req.params.id);
  await requireProject(req.user, id, 'manage');
  await query('DELETE FROM projects WHERE id = $1', [id]);
  res.json({ ok: true });
}));

// ---- Membros --------------------------------------------------------------
router.put('/:id/members/:userId', ah(async (req, res) => {
  const id = intParam(req.params.id);
  await requireProject(req.user, id, 'manage');
  const { role: requested } = parse(z.object({ role: z.enum(['editor', 'leitor']).default('leitor') }), req.body);
  const userId = intParam(req.params.userId, 'userId');
  const { rows: [sp] } = await query('SELECT space FROM projects WHERE id = $1', [id]);
  if (sp.space === 'pessoal') throw new HttpError(400, 'Projetos individuais são só seus. Para trabalhar com outras pessoas, use um projeto corporativo.');
  const { rows: [mgr] } = await query('SELECT th_is_manager($1) AS ok', [userId]);
  const role = requested === 'editor' && mgr.ok ? 'editor' : 'leitor';
  const { rows: [already] } = await query('SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2', [id, userId]);
  await query(
    `INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, $3)
     ON CONFLICT (project_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
    [id, userId, role]
  );
  if (!already) {
    const { rows: [p] } = await query('SELECT name FROM projects WHERE id = $1', [id]);
    await notify(null, { userId, actorId: req.user.id, type: 'project_added', projectId: id,
      title: `${req.user.name} incluiu você em um projeto`, body: p.name });
  }
  res.json({ ok: true });
}));

router.delete('/:id/members/:userId', ah(async (req, res) => {
  const id = intParam(req.params.id);
  await requireProject(req.user, id, 'manage');
  const { rows: [p] } = await query('SELECT owner_id FROM projects WHERE id = $1', [id]);
  if (p.owner_id === Number(req.params.userId)) throw new HttpError(400, 'Passe a posse do projeto antes de remover o dono.');
  await query('DELETE FROM project_members WHERE project_id = $1 AND user_id = $2', [id, intParam(req.params.userId, 'userId')]);
  res.json({ ok: true });
}));

// ---- Fluxo de status --------------------------------------------------------
const statusSchema = z.object({
  name: z.string().trim().min(1).max(60),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#8b93a1'),
  category: z.enum(['todo', 'doing', 'blocked', 'done', 'canceled']),
  wip_limit: z.coerce.number().int().min(1).max(999).nullable().optional(),
});

router.post('/:id/statuses', ah(async (req, res) => {
  const id = intParam(req.params.id);
  await requireProject(req.user, id, 'manage');
  const d = parse(statusSchema, req.body);
  const { rows: [pos] } = await query(
    'SELECT COALESCE(MAX(position), -1) + 1 AS n FROM workflow_statuses WHERE project_id = $1', [id]
  );
  const { rows } = await query(
    `INSERT INTO workflow_statuses (project_id, name, color, category, wip_limit, position)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [id, d.name, d.color, d.category, d.wip_limit ?? null, pos.n]
  );
  res.status(201).json(rows[0]);
}));

router.put('/:id/statuses/order', ah(async (req, res) => {
  const id = intParam(req.params.id);
  await requireProject(req.user, id, 'manage');
  const { ids } = parse(z.object({ ids: z.array(z.number().int()) }), req.body);
  await tx(async (c) => {
    for (let i = 0; i < ids.length; i++) {
      await c.query('UPDATE workflow_statuses SET position = $1 WHERE id = $2 AND project_id = $3', [i, ids[i], id]);
    }
  });
  res.json({ ok: true });
}));

router.patch('/:id/statuses/:statusId', ah(async (req, res) => {
  const id = intParam(req.params.id);
  await requireProject(req.user, id, 'manage');
  const d = parse(statusSchema.partial(), req.body);
  const sets = []; const params = [];
  for (const [k, v] of Object.entries(d)) { params.push(v); sets.push(`${k} = $${params.length}`); }
  if (!sets.length) throw new HttpError(400, 'Nada para atualizar.');
  params.push(intParam(req.params.statusId, 'statusId'), id);
  const { rows } = await query(
    `UPDATE workflow_statuses SET ${sets.join(', ')} WHERE id = $${params.length - 1} AND project_id = $${params.length} RETURNING *`,
    params
  );
  if (!rows[0]) throw new HttpError(404, 'Status não encontrado');
  res.json(rows[0]);
}));

// Exclui um status movendo as tarefas dele para outro.
router.delete('/:id/statuses/:statusId', ah(async (req, res) => {
  const id = intParam(req.params.id);
  await requireProject(req.user, id, 'manage');
  const statusId = intParam(req.params.statusId, 'statusId');
  const moveTo = intParam(req.query.move_to, 'move_to');
  if (moveTo === statusId) throw new HttpError(400, 'Escolha outro status para receber as tarefas.');
  const { rows } = await query('SELECT id, category FROM workflow_statuses WHERE project_id = $1', [id]);
  const target = rows.find(r => r.id === moveTo);
  const removed = rows.find(r => r.id === statusId);
  if (!target || !removed) throw new HttpError(404, 'Status não encontrado');
  const rest = rows.filter(r => r.id !== statusId);
  if (!rest.some(r => r.category === 'todo') || !rest.some(r => r.category === 'done')) {
    throw new HttpError(400, 'O fluxo precisa manter ao menos um status "A fazer" e um "Concluído".');
  }
  await tx(async (c) => {
    await c.query('UPDATE tasks SET status_id = $1 WHERE status_id = $2', [moveTo, statusId]);
    await c.query('DELETE FROM workflow_statuses WHERE id = $1', [statusId]);
  });
  res.json({ ok: true });
}));

// ---- Seções -----------------------------------------------------------------
router.post('/:id/sections', ah(async (req, res) => {
  const id = intParam(req.params.id);
  await requireProject(req.user, id, 'edit');
  const { name } = parse(z.object({ name: z.string().trim().min(1).max(100) }), req.body);
  const { rows: [pos] } = await query(
    'SELECT COALESCE(MAX(position), -1) + 1 AS n FROM project_sections WHERE project_id = $1', [id]
  );
  const { rows } = await query(
    `INSERT INTO project_sections (project_id, name, description, position, created_by)
     VALUES ($1, $2, '', $3, $4) RETURNING *`,
    [id, name, pos.n, req.user.id]
  );
  res.status(201).json(rows[0]);
}));

router.patch('/:id/sections/:sectionId', ah(async (req, res) => {
  const id = intParam(req.params.id);
  await requireProject(req.user, id, 'edit');
  const d = parse(z.object({ name: z.string().trim().min(1).max(100).optional(), position: z.number().int().optional() }), req.body);
  const { rows } = await query(
    `UPDATE project_sections SET name = COALESCE($1, name), position = COALESCE($2, position)
      WHERE id = $3 AND project_id = $4 RETURNING *`,
    [d.name ?? null, d.position ?? null, intParam(req.params.sectionId, 'sectionId'), id]
  );
  if (!rows[0]) throw new HttpError(404, 'Seção não encontrada');
  res.json(rows[0]);
}));

router.delete('/:id/sections/:sectionId', ah(async (req, res) => {
  const id = intParam(req.params.id);
  await requireProject(req.user, id, 'edit');
  await query('DELETE FROM project_sections WHERE id = $1 AND project_id = $2', [intParam(req.params.sectionId, 'sectionId'), id]);
  res.json({ ok: true });
}));

module.exports = router;
module.exports.projectRole = projectRole;
module.exports.requireProject = requireProject;
