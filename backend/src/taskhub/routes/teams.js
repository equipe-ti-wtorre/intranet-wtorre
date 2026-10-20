const router = require('express').Router();
const { z } = require('zod');
const { query, tx } = require('../db');
const { ah, parse, intParam, HttpError } = require('../lib/http');
const { has } = require('../lib/permissions');

async function oversees(user, teamId) {
  const { rows } = await query('SELECT th_oversees_team($1, $2) AS ok', [user.id, teamId]);
  return rows[0].ok;
}

async function overseesSector(user, sectorId) {
  const { rows } = await query('SELECT th_oversees_sector($1, $2) AS ok', [user.id, sectorId]);
  return rows[0].ok;
}

// Quem edita uma equipe (nome, membros, gestores, excluir): gestores do setor ou da própria equipe.
async function canEdit(user, teamId) {
  const { rows } = await query(
    `SELECT EXISTS (SELECT 1 FROM team_managers WHERE team_id = $2 AND user_id = $1)
         OR EXISTS (SELECT 1 FROM sector_managers sm JOIN teams t ON t.sector_id = sm.sector_id WHERE t.id = $2 AND sm.user_id = $1) AS ok`,
    [user.id, teamId]
  );
  return rows[0].ok;
}
async function requireEdit(user, teamId) {
  if (!(await canEdit(user, teamId))) throw new HttpError(403, 'Apenas os gestores desta equipe ou do setor podem fazer isso.');
}

// Setores em que a pessoa pode criar equipes: os que gerencia e o próprio. Sem o acesso de criar equipes, a lista fica vazia.
async function creatableSectors(user) {
  if (!has(user, 'criar_equipes')) return [];
  const { rows } = await query(
    `SELECT sector_id AS id FROM sector_managers WHERE user_id = $1
     UNION SELECT sector_id FROM users WHERE id = $1 AND sector_id IS NOT NULL`, [user.id]
  );
  return rows.map(r => r.id);
}

const TEAM_SELECT = `
  SELECT t.id, t.name, t.description, t.color, t.sector_id, s.name AS sector_name, t.created_by,
    th_oversees_team($1, t.id) AS can_dashboard,
    (SELECT COUNT(*) FROM team_members m WHERE m.team_id = t.id) AS members_count,
    (SELECT COUNT(*) FROM projects p WHERE p.team_id = t.id AND p.archived = false AND p.space = 'profissional') AS projects_count,
    EXISTS (SELECT 1 FROM team_members m WHERE m.team_id = t.id AND m.user_id = $1) AS is_member,
    COALESCE((SELECT json_agg(json_build_object('id', u.id, 'name', u.name, 'initials', u.initials, 'color', u.color) ORDER BY u.name)
                FROM team_managers tm JOIN users u ON u.id = tm.user_id WHERE tm.team_id = t.id), '[]') AS managers
  FROM teams t LEFT JOIN sectors s ON s.id = t.sector_id`;

router.get('/', ah(async (req, res) => {
  const all = has(req.user, 'ver_todas_equipes');
  const { rows } = await query(
    `${TEAM_SELECT}
      WHERE t.archived = false AND ($2 OR th_oversees_team($1, t.id)
            OR EXISTS (SELECT 1 FROM team_members m WHERE m.team_id = t.id AND m.user_id = $1))
      ORDER BY s.name, t.name`,
    [req.user.id, all]
  );
  const editable = new Set();
  for (const t of rows) if (await canEdit(req.user, t.id)) editable.add(t.id);
  res.json({
    teams: rows.map(t => ({ ...t, can_edit: editable.has(t.id) })),
    creatable_sectors: await creatableSectors(req.user),
  });
}));

const schema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(500).default(''),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#3b82f6'),
  sector_id: z.coerce.number().int().positive(),
});

router.post('/', ah(async (req, res) => {
  const d = parse(schema, req.body);
  if (!(await creatableSectors(req.user)).includes(d.sector_id)) {
    throw new HttpError(403, 'Você não pode criar equipes neste setor.');
  }
  const id = await tx(async (c) => {
    const { rows: [t] } = await c.query(
      `INSERT INTO teams (name, description, color, sector_id, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [d.name, d.description, d.color, d.sector_id, req.user.id]
    );
    // Quem cria vira gestor da equipe.
    await c.query('INSERT INTO team_managers (team_id, user_id) VALUES ($1, $2)', [t.id, req.user.id]);
    return t.id;
  });
  const { rows } = await query(`${TEAM_SELECT} WHERE t.id = $2`, [req.user.id, id]);
  res.status(201).json({ ...rows[0], can_edit: true });
}));

router.get('/:id', ah(async (req, res) => {
  const id = intParam(req.params.id);
  const { rows: [team] } = await query(`${TEAM_SELECT} WHERE t.id = $2`, [req.user.id, id]);
  if (!team) throw new HttpError(404, 'Equipe não encontrada');
  if (!team.can_dashboard && !team.is_member) throw new HttpError(404, 'Equipe não encontrada');
  const { rows: members } = await query(
    `SELECT u.id, u.name, u.username, u.initials, u.color, u.job_title, u.daily_capacity_min, u.profiles,
            EXISTS (SELECT 1 FROM team_managers tm WHERE tm.team_id = $1 AND tm.user_id = u.id) AS is_manager
       FROM team_members m JOIN users u ON u.id = m.user_id
      WHERE m.team_id = $1 AND u.active IS DISTINCT FROM false ORDER BY u.name`, [id]
  );
  res.json({ ...team, can_edit: await canEdit(req.user, id), members });
}));

router.patch('/:id', ah(async (req, res) => {
  const id = intParam(req.params.id);
  await requireEdit(req.user, id);
  const d = parse(schema.omit({ sector_id: true }).partial(), req.body);
  const sets = []; const params = [];
  for (const [k, v] of Object.entries(d)) { params.push(v); sets.push(`${k} = $${params.length}`); }
  if (!sets.length) throw new HttpError(400, 'Nada para atualizar.');
  params.push(id);
  await query(`UPDATE teams SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
  const { rows } = await query(`${TEAM_SELECT} WHERE t.id = $2`, [req.user.id, id]);
  res.json({ ...rows[0], can_edit: true });
}));

router.delete('/:id', ah(async (req, res) => {
  const id = intParam(req.params.id);
  await requireEdit(req.user, id);
  await query('DELETE FROM teams WHERE id = $1', [id]);
  res.json({ ok: true });
}));

// Membros: pessoas do AD, do mesmo setor. Cada pessoa fica em no máximo uma equipe, então incluir
// aqui tira a pessoa da equipe anterior. Gestor da equipe pode ser uma conta local.
router.put('/:id/members/:userId', ah(async (req, res) => {
  const id = intParam(req.params.id);
  const userId = intParam(req.params.userId, 'userId');
  await requireEdit(req.user, id);
  const { rows: [chk] } = await query(
    `SELECT u.sector_id = t.sector_id AS same, u.entra_oid IS NOT NULL AS from_directory,
            (SELECT x.name FROM teams x JOIN team_members m ON m.team_id = x.id WHERE m.user_id = u.id AND x.id <> t.id LIMIT 1) AS other
       FROM users u, teams t WHERE u.id = $1 AND t.id = $2`, [userId, id]
  );
  if (!chk) throw new HttpError(404, 'Pessoa ou equipe não encontrada');
  if (!chk.from_directory) throw new HttpError(400, 'Só pessoas do AD entram na equipe.');
  if (!chk.same) throw new HttpError(400, 'Só pessoas do mesmo setor podem entrar na equipe. O setor da pessoa é definido em Administração.');
  await tx(async (c) => {
    await c.query('DELETE FROM team_members WHERE user_id = $1', [userId]);
    await c.query(`INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, 'membro')`, [id, userId]);
  });
  res.json({ ok: true, moved_from: chk.other || null });
}));

router.delete('/:id/members/:userId', ah(async (req, res) => {
  const id = intParam(req.params.id);
  await requireEdit(req.user, id);
  await query('DELETE FROM team_members WHERE team_id = $1 AND user_id = $2', [id, intParam(req.params.userId, 'userId')]);
  res.json({ ok: true });
}));

// Gestores da equipe (podem ser de fora dela, por exemplo o gestor do setor).
router.put('/:id/managers/:userId', ah(async (req, res) => {
  const id = intParam(req.params.id);
  await requireEdit(req.user, id);
  await query('INSERT INTO team_managers (team_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, intParam(req.params.userId, 'userId')]);
  res.json({ ok: true });
}));

router.delete('/:id/managers/:userId', ah(async (req, res) => {
  const id = intParam(req.params.id);
  await requireEdit(req.user, id);
  const { rows: [n] } = await query('SELECT COUNT(*)::int AS n FROM team_managers WHERE team_id = $1', [id]);
  if (n.n <= 1) throw new HttpError(400, 'A equipe precisa de pelo menos um gestor.');
  await query('DELETE FROM team_managers WHERE team_id = $1 AND user_id = $2', [id, intParam(req.params.userId, 'userId')]);
  res.json({ ok: true });
}));

module.exports = router;
module.exports.oversees = oversees;
module.exports.overseesSector = overseesSector;
