const router = require('express').Router();
const { z } = require('zod');
const { query, tx } = require('../db');
const { ah, parse, intParam, HttpError } = require('../lib/http');
const { has } = require('../lib/permissions');

const requireAdmin = (user) => {
  if (!has(user, 'gerenciar_pessoas_todas')) throw new HttpError(403, 'Apenas o administrador gerencia setores.');
};

const SECTOR_SELECT = `
  SELECT s.*,
    th_oversees_sector($1, s.id) AS can_dashboard,
    (SELECT COUNT(*) FROM users u WHERE u.sector_id = s.id AND u.active IS DISTINCT FROM false) AS people_count,
    (SELECT COUNT(*) FROM teams t WHERE t.sector_id = s.id AND t.archived = false) AS teams_count,
    COALESCE((SELECT json_agg(json_build_object('id', u.id, 'name', u.name, 'initials', u.initials, 'color', u.color) ORDER BY u.name)
                FROM sector_managers sm JOIN users u ON u.id = sm.user_id WHERE sm.sector_id = s.id), '[]') AS managers
  FROM sectors s`;

// Setores visíveis: todos para quem administra ou vê tudo; senão, os que a pessoa gerencia,
// acompanha como diretoria ou em que trabalha.
router.get('/', ah(async (req, res) => {
  const all = has(req.user, 'gerenciar_pessoas_todas') || has(req.user, 'ver_todas_equipes');
  const { rows } = await query(
    `${SECTOR_SELECT}
      WHERE s.archived = false AND ($2 OR th_oversees_sector($1, s.id) OR s.id = $3)
      ORDER BY s.name`,
    [req.user.id, all, req.user.sector_id || 0]
  );
  res.json(rows);
}));

const schema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(500).default(''),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#3b82f6'),
  people: z.array(z.coerce.number().int().positive()).max(2000).optional(),
  managers: z.array(z.coerce.number().int().positive()).max(50).optional(),
});

// Cada pessoa fica em um setor. Quem entra deixa de estar sem setor; quem sai perde este setor e as equipes dele.
async function setPeople(c, sectorId, ids) {
  const unique = [...new Set(ids)];
  if (unique.length) {
    const { rows } = await c.query('SELECT id, sector_id FROM users WHERE id = ANY($1)', [unique]);
    if (rows.length !== unique.length) throw new HttpError(400, 'Há uma pessoa inválida na lista do setor.');
    if (rows.some(r => r.sector_id && Number(r.sector_id) !== Number(sectorId))) {
      throw new HttpError(400, 'Uma pessoa já está em outro setor.');
    }
    await c.query('UPDATE users SET sector_id = $1 WHERE id = ANY($2)', [sectorId, unique]);
  }
  const { rows: leaving } = await c.query(
    'SELECT id FROM users WHERE sector_id = $1 AND NOT (id = ANY($2))',
    [sectorId, unique]
  );
  if (!leaving.length) return;
  const leaveIds = leaving.map(r => r.id);
  await c.query(
    'DELETE FROM team_members WHERE user_id = ANY($1) AND team_id IN (SELECT id FROM teams WHERE sector_id = $2)',
    [leaveIds, sectorId]
  );
  await c.query('UPDATE users SET sector_id = NULL WHERE id = ANY($1)', [leaveIds]);
}

async function setManagers(c, sectorId, ids) {
  const unique = [...new Set(ids)];
  if (unique.length) {
    const { rows } = await c.query(
      `SELECT id FROM users WHERE id = ANY($1) AND sector_id = $2 AND 'gestor' = ANY(profiles)`,
      [unique, sectorId]
    );
    if (rows.length !== unique.length) throw new HttpError(400, 'O gestor precisa estar no setor e ter o perfil Gestor.');
  }
  await c.query('DELETE FROM sector_managers WHERE sector_id = $1', [sectorId]);
  for (const uid of unique) {
    await c.query('INSERT INTO sector_managers (sector_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [sectorId, uid]);
  }
}

router.post('/', ah(async (req, res) => {
  requireAdmin(req.user);
  const d = parse(schema, req.body);
  const id = await tx(async (c) => {
    const { rows: [s] } = await c.query(
      'INSERT INTO sectors (name, description, color) VALUES ($1, $2, $3) RETURNING id', [d.name, d.description, d.color]
    );
    await setPeople(c, s.id, d.people || []);
    await setManagers(c, s.id, d.managers || []);
    return s.id;
  });
  const { rows } = await query(`${SECTOR_SELECT} WHERE s.id = $2`, [req.user.id, id]);
  res.status(201).json(rows[0]);
}));

router.patch('/:id', ah(async (req, res) => {
  requireAdmin(req.user);
  const id = intParam(req.params.id);
  const d = parse(schema.partial(), req.body);
  await tx(async (c) => {
    const sets = []; const params = [];
    for (const k of ['name', 'description', 'color']) if (d[k] !== undefined) { params.push(d[k]); sets.push(`${k} = $${params.length}`); }
    if (sets.length) { params.push(id); await c.query(`UPDATE sectors SET ${sets.join(', ')} WHERE id = $${params.length}`, params); }
    if (d.people !== undefined) await setPeople(c, id, d.people);
    if (d.managers !== undefined) await setManagers(c, id, d.managers);
  });
  const { rows } = await query(`${SECTOR_SELECT} WHERE s.id = $2`, [req.user.id, id]);
  if (!rows[0]) throw new HttpError(404, 'Setor não encontrado');
  res.json(rows[0]);
}));

// Excluir um setor apaga as equipes dele; as pessoas ficam sem setor até serem realocadas.
router.delete('/:id', ah(async (req, res) => {
  requireAdmin(req.user);
  const id = intParam(req.params.id);
  await tx(async (c) => {
    await c.query('DELETE FROM team_members WHERE team_id IN (SELECT id FROM teams WHERE sector_id = $1)', [id]);
    await c.query('UPDATE users SET sector_id = NULL WHERE sector_id = $1', [id]);
    await c.query('UPDATE users SET directed_sectors = array_remove(directed_sectors, $1)', [id]);
    await c.query('DELETE FROM sectors WHERE id = $1', [id]);
  });
  res.json({ ok: true });
}));

module.exports = router;
