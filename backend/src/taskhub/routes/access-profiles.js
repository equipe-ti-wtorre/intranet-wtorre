const router = require('express').Router();
const { z } = require('zod');
const { query, tx } = require('../db');
const { ah, parse, HttpError } = require('../lib/http');
const { PERMISSIONS, PERMISSION_KEYS, has, syncLegacy } = require('../lib/permissions');

const requireAdmin = (user) => {
  if (!has(user, 'gerenciar_pessoas_todas')) throw new HttpError(403, 'Apenas o administrador gerencia perfis de acesso.');
};

const slug = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);
const ADMIN_ONLY_PERM = 'gerenciar_pessoas_todas';
const withoutPeoplePerms = (list) => (list || []).filter(p => p !== ADMIN_ONLY_PERM);

// Catálogo: perfis (com quantas pessoas usam) e a lista fixa de acessos.
router.get('/', ah(async (req, res) => {
  const { rows } = await query(
    `SELECT ap.*, (SELECT COUNT(*) FROM users u WHERE ap.key = ANY(u.profiles) AND u.active IS DISTINCT FROM false) AS users_count
       FROM access_profiles ap ORDER BY ap.position, ap.label`
  );
  res.json({ profiles: rows, permissions: PERMISSIONS });
}));

const schema = z.object({
  label: z.string().trim().min(2).max(60),
  description: z.string().trim().max(500).default(''),
  permissions: z.array(z.enum(PERMISSION_KEYS)).default([]),
});

// No zod 4, partial() mantém os defaults: sem tirar, um PATCH só com nome inventaria permissions [].
const patchSchema = schema.extend({
  description: z.string().trim().max(500),
  permissions: z.array(z.enum(PERMISSION_KEYS)),
}).partial();

router.post('/', ah(async (req, res) => {
  requireAdmin(req.user);
  const d = parse(schema, req.body);
  d.permissions = withoutPeoplePerms(d.permissions);
  let key = slug(d.label) || 'perfil';
  const { rows: exists } = await query('SELECT key FROM access_profiles WHERE key LIKE $1', [`${key}%`]);
  if (exists.some(r => r.key === key)) key = `${key}_${exists.length + 1}`;
  await query(
    `INSERT INTO access_profiles (key, label, description, permissions, system, position)
     VALUES ($1, $2, $3, $4, false, 50)`, [key, d.label, d.description, d.permissions]
  );
  const { rows } = await query('SELECT * FROM access_profiles WHERE key = $1', [key]);
  res.status(201).json(rows[0]);
}));

router.patch('/:key', ah(async (req, res) => {
  requireAdmin(req.user);
  const d = parse(patchSchema, req.body);
  if (req.params.key === 'admin') delete d.permissions;
  else if (d.permissions) d.permissions = withoutPeoplePerms(d.permissions);
  const sets = []; const params = [];
  for (const [k, v] of Object.entries(d)) { params.push(v); sets.push(`${k} = $${params.length}`); }
  if (!sets.length) throw new HttpError(400, 'Nada para atualizar.');
  params.push(req.params.key);
  const { rows } = await query(`UPDATE access_profiles SET ${sets.join(', ')} WHERE key = $${params.length} RETURNING *`, params);
  if (!rows[0]) throw new HttpError(404, 'Perfil não encontrado');
  res.json(rows[0]);
}));

// Perfis do sistema não são excluídos. Quem usava um perfil excluído e fica sem nenhum vira Colaborador.
router.delete('/:key', ah(async (req, res) => {
  requireAdmin(req.user);
  const { rows: [p] } = await query('SELECT system FROM access_profiles WHERE key = $1', [req.params.key]);
  if (!p) throw new HttpError(404, 'Perfil não encontrado');
  if (p.system) throw new HttpError(400, 'Os perfis padrão não podem ser excluídos; edite os acessos deles se precisar.');
  await tx(async (c) => {
    const { rows: users } = await c.query(
      'SELECT id FROM users WHERE JSON_CONTAINS(profiles, JSON_QUOTE($1))', [req.params.key]
    );
    await c.query(
      `UPDATE users
          SET profiles = JSON_REMOVE(profiles, JSON_UNQUOTE(JSON_SEARCH(profiles, 'one', $1)))
        WHERE JSON_CONTAINS(profiles, JSON_QUOTE($1))`,
      [req.params.key]
    );
    await c.query(`UPDATE users SET profiles = JSON_ARRAY('colaborador') WHERE JSON_LENGTH(profiles) = 0`);
    await c.query('DELETE FROM access_profiles WHERE key = $1', [req.params.key]);
    for (const u of users) await syncLegacy(c, u.id);
  });
  res.json({ ok: true });
}));

module.exports = router;
