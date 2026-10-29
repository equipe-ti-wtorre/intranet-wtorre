const router = require('express').Router();
const bcrypt = require('bcrypt');
const { z } = require('zod');
const { query, tx } = require('../db');
const { ah, parse, intParam, HttpError } = require('../lib/http');
const { initialsFrom, formatUser, passwordProblem, colorFor, TEAM_FIELDS } = require('../lib/users');
const { avatarUrl, saveAvatar, removeAvatar } = require('../lib/avatars');
const { PERMISSION_KEYS, PROFILE_SQL, has, syncLegacy } = require('../lib/permissions');
const { isEnabled } = require('../lib/entra');
const { syncDirectory } = require('../lib/entra-sync');

// A pessoa pode estar em várias equipes: team_id é a primeira (por id), team_name junta todas.
const USER_SELECT = `SELECT u.*, ${TEAM_FIELDS('u')}, s.name AS sector_name, ${PROFILE_SQL('u')}
  FROM users u LEFT JOIN sectors s ON s.id = u.sector_id`;

// Setores e equipes que alguém gerencia (para o escopo "pessoas que gerencio").
const MANAGED = `(
  u.sector_id IN (SELECT sector_id FROM sector_managers WHERE user_id = $1)
  OR EXISTS (SELECT 1 FROM team_members mm WHERE mm.user_id = u.id AND (
       mm.team_id IN (SELECT team_id FROM team_managers WHERE user_id = $1)
       OR mm.team_id IN (SELECT t2.id FROM teams t2 JOIN sector_managers sm ON sm.sector_id = t2.sector_id WHERE sm.user_id = $1)))
)`;

// Cadastro de pessoas: só o administrador. O gestor de equipe inclui na equipe quem já veio do AD.
function scope(user) {
  if (has(user, 'gerenciar_pessoas_todas')) return 'all';
  return null;
}
function requireScope(req) {
  const s = scope(req.user);
  if (!s) throw new HttpError(403, 'Apenas o administrador gerencia pessoas.');
  return s;
}
async function requireInScope(req, s, userId) {
  if (s === 'all') return;
  const { rows } = await query(`${USER_SELECT} WHERE u.id = $2 AND ${MANAGED}`, [req.user.id, userId]);
  if (!rows.length) throw new HttpError(403, 'Você só gerencia pessoas dos setores e equipes que gerencia.');
  // O gestor cuida dos colaboradores; contas com outros perfis ficam com o administrador.
  if (userId !== req.user.id && rows[0].profiles.some(p => p !== 'colaborador')) {
    throw new HttpError(403, 'Contas de gestores, diretoria e administradores são gerenciadas pelo administrador.');
  }
}

// Valida setor e equipe: a equipe precisa ser do setor; no escopo de gestor, ambos precisam ser dele.
async function checkPlacement(req, s, sectorId, teamId) {
  if (teamId) {
    const { rows: [t] } = await query('SELECT sector_id FROM teams WHERE id = $1', [teamId]);
    if (!t) throw new HttpError(400, 'Equipe não encontrada.');
    if (sectorId && t.sector_id !== sectorId) throw new HttpError(400, 'A equipe escolhida não é deste setor.');
    sectorId = sectorId || t.sector_id;
  }
  if (s === 'team') {
    const { rows: [ok] } = await query(
      `SELECT ($2::int IS NULL OR $2 IN (SELECT sector_id FROM sector_managers WHERE user_id = $1)
                OR $3::int IN (SELECT team_id FROM team_managers WHERE user_id = $1)) AS sector_ok,
              ($3::int IS NULL OR $3 IN (SELECT team_id FROM team_managers WHERE user_id = $1)
                OR $3 IN (SELECT t.id FROM teams t JOIN sector_managers sm ON sm.sector_id = t.sector_id WHERE sm.user_id = $1)) AS team_ok`,
      [req.user.id, sectorId || null, teamId || null]
    );
    if (!ok.sector_ok || !ok.team_ok) throw new HttpError(403, 'Escolha um setor ou equipe que você gerencia.');
  }
  return sectorId || null;
}

async function checkProfiles(keys) {
  if (!keys) return;
  const { rows } = await query('SELECT key FROM access_profiles WHERE key = ANY($1)', [keys]);
  if (rows.length !== new Set(keys).size) throw new HttpError(400, 'Perfil de acesso inválido.');
}

// Com equipe: inclui a pessoa nela (sem tirar das outras). Sem equipe (mudou de setor): sai de todas.
async function setTeam(run, userId, teamId) {
  if (!teamId) { await run.query('DELETE FROM team_members WHERE user_id = $1', [userId]); return; }
  await run.query(`INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, 'membro') ON CONFLICT DO NOTHING`, [teamId, userId]);
}

async function blockDirectory(run, oid, motivo) {
  if (!oid) return;
  await run.query(
    `INSERT INTO directory_blocks (entra_oid, motivo) VALUES ($1, $2)
     ON CONFLICT (entra_oid) DO UPDATE SET motivo = EXCLUDED.motivo`,
    [oid, motivo]
  );
}

async function unblockDirectory(run, oid) {
  if (!oid) return;
  await run.query('DELETE FROM directory_blocks WHERE entra_oid = $1', [oid]);
}

async function otherActiveAdmins(excludeId) {
  const { rows } = await query(
    `SELECT COUNT(*)::int AS n FROM users WHERE 'admin' = ANY(profiles) AND active IS DISTINCT FROM false AND id <> $1`, [excludeId]
  );
  return rows[0].n;
}

const listRow = (r) => ({ ...formatUser(r), team_name: r.team_name || null, sector_name: r.sector_name || null, last_login_at: r.last_login_at });

// Diretório de pessoas para escolher responsável, mencionar etc.
router.get('/directory', ah(async (req, res) => {
  const { rows } = await query(
    `SELECT u.id, u.name, u.username, u.initials, u.color, u.avatar_rev, u.job_title, u.away_until, u.profiles, u.sector_id,
            (u.entra_oid IS NOT NULL) AS from_directory,
            th_is_manager(u.id) AS can_coordinate,
            s.name AS sector_name, ${TEAM_FIELDS('u')}
       FROM users u
       LEFT JOIN sectors s ON s.id = u.sector_id
      WHERE u.active IS DISTINCT FROM false ORDER BY u.name`
  );
  res.json(rows.map(r => {
    const url = avatarUrl(r);
    delete r.avatar_rev;
    return { ...r, avatar_url: url };
  }));
}));

const imageBody = z.object({ image: z.string().min(20).max(1_500_000) });

async function userPayload(id) {
  const { rows } = await query(`${USER_SELECT} WHERE u.id = $1`, [id]);
  if (!rows.length) throw new HttpError(404, 'Pessoa não encontrada');
  return rows[0];
}

router.post('/me/avatar', ah(async (req, res) => {
  const { image } = parse(imageBody, req.body);
  await saveAvatar(req.user.id, image);
  res.json(formatUser(await userPayload(req.user.id)));
}));

router.delete('/me/avatar', ah(async (req, res) => {
  await removeAvatar(req.user.id);
  res.json(formatUser(await userPayload(req.user.id)));
}));

// Preferências da própria pessoa.
router.patch('/me', ah(async (req, res) => {
  if (req.body?.daily_capacity_min !== undefined) {
    throw new HttpError(400, 'A carga do dia usa 7 horas para todo mundo; a capacidade por pessoa saiu.');
  }
  const data = parse(z.object({
    name: z.string().trim().min(2).max(100).optional(),
    job_title: z.string().trim().max(100).optional(),
    away_until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  }), req.body);
  const sets = []; const params = [];
  for (const [k, v] of Object.entries(data)) { params.push(v); sets.push(`${k} = $${params.length}`); }
  if (data.name) { params.push(initialsFrom(data.name)); sets.push(`initials = $${params.length}`); }
  if (sets.length) {
    params.push(req.user.id);
    await query(`UPDATE users SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
  }
  const { rows } = await query(`${USER_SELECT} WHERE u.id = $1`, [req.user.id]);
  res.json(formatUser(rows[0]));
}));

// ---- Gestão de pessoas -----------------------------------------------------
router.get('/', ah(async (req, res) => {
  const s = requireScope(req);
  const { rows } = await query(
    `${USER_SELECT} WHERE ($1::int IS NULL OR ${MANAGED}) ORDER BY u.active DESC, u.name`,
    [s === 'team' ? req.user.id : null]
  );
  res.json(rows.map(listRow));
}));

router.post('/sync-directory', ah(async (req, res) => {
  if (scope(req.user) !== 'all') throw new HttpError(403, 'Apenas o administrador sincroniza o diretório.');
  if (!(await isEnabled())) throw new HttpError(422, 'O diretório Microsoft não está configurado neste ambiente.');
  res.json(await syncDirectory());
}));

const base = {
  name: z.string().trim().min(2).max(100),
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,80}$/, 'use letras minúsculas, números, ponto, hífen ou sublinhado'),
  email: z.string().trim().email().max(150).optional().or(z.literal('')),
  job_title: z.string().trim().max(100).optional().default(''),
  sector_id: z.coerce.number().int().positive().nullable().optional(),
  team_id: z.coerce.number().int().positive().nullable().optional(),
  profiles: z.array(z.string().max(40)).min(1, 'escolha ao menos um perfil').optional(),
  permissions: z.array(z.enum(PERMISSION_KEYS)).optional(),
  directed_sectors: z.array(z.coerce.number().int().positive()).optional(),
};

router.post('/', ah(async (req, res) => {
  const s = requireScope(req);
  const data = parse(z.object({ ...base, password: z.string().min(1) }), req.body);
  // Gestor cadastra colaboradores da própria equipe; perfis e acessos ficam com o administrador.
  if (s === 'team') { data.profiles = ['colaborador']; data.permissions = []; data.directed_sectors = []; }
  await checkProfiles(data.profiles);
  if (!(data.profiles || []).includes('admin')) {
    data.permissions = (data.permissions || []).filter(p => p !== 'gerenciar_pessoas_todas');
  }
  if (s === 'all') data.team_id = null;
  data.sector_id = await checkPlacement(req, s, data.sector_id, data.team_id);
  if (s === 'team' && !data.sector_id) throw new HttpError(400, 'Escolha a equipe da pessoa.');
  const problem = passwordProblem(data.password, data.username);
  if (problem) throw new HttpError(400, problem);
  const email = data.email || `${data.username}@taskhub.local`;
  const dup = await query(`SELECT 1 FROM users WHERE LOWER(username) = $1 OR LOWER(email) = LOWER($2)`, [data.username, email]);
  if (dup.rows.length) throw new HttpError(409, 'Já existe uma pessoa com esse usuário ou e-mail.');

  const id = await tx(async (c) => {
    const { rows: [u] } = await c.query(
      `INSERT INTO users (name, email, password, initials, color, role, username, job_title, must_change_password,
                          profiles, permissions, directed_teams, directed_sectors, sector_id)
       VALUES ($1, $2, $3, $4, $5, 'membro', $6, $7, true, $8, $9, '[]', $10, $11) RETURNING id`,
      [data.name, email, await bcrypt.hash(data.password, 10), initialsFrom(data.name), colorFor(data.username),
        data.username, data.job_title, data.profiles || ['colaborador'], data.permissions || [], data.directed_sectors || [], data.sector_id]
    );
    if (data.team_id) await setTeam(c, u.id, data.team_id);
    await syncLegacy(c, u.id);
    return u.id;
  });
  const { rows } = await query(`${USER_SELECT} WHERE u.id = $1`, [id]);
  res.status(201).json(listRow(rows[0]));
}));

router.patch('/:id', ah(async (req, res) => {
  const s = requireScope(req);
  const id = intParam(req.params.id);
  await requireInScope(req, s, id);
  const data = parse(z.object({ ...base, active: z.boolean().optional() }).partial(), req.body);
  if (s === 'team') {
    const blocked = ['profiles', 'permissions', 'directed_sectors'].filter(k => data[k] !== undefined);
    if (blocked.length) throw new HttpError(403, 'Perfis e acessos são definidos pelo administrador.');
  }
  await checkProfiles(data.profiles);
  // O administrador não coloca ninguém em equipe. Se mudar o setor, a pessoa sai da equipe anterior.
  if (s === 'all') delete data.team_id;
  if (data.sector_id !== undefined || data.team_id !== undefined) {
    const previousSector = s === 'all'
      ? (await query('SELECT sector_id FROM users WHERE id = $1', [id])).rows[0]?.sector_id ?? null
      : undefined;
    const resolved = await checkPlacement(req, s, data.sector_id ?? null, data.team_id ?? null);
    if (data.sector_id !== undefined || resolved) data.sector_id = resolved;
    if (s === 'all') {
      if (data.sector_id !== previousSector) data.team_id = null;
    } else if (data.sector_id !== undefined && data.team_id === undefined) {
      data.team_id = null;
    }
  }
  const { rows: [cur] } = await query('SELECT profiles, entra_oid FROM users WHERE id = $1', [id]);
  if (!cur) throw new HttpError(404, 'Pessoa não encontrada');
  if (cur.entra_oid) {
    delete data.name;
    delete data.username;
    delete data.email;
    delete data.job_title;
  }
  if (id === req.user.id && data.active === false) throw new HttpError(400, 'Você não pode desativar a própria conta.');
  const losingAdmin = cur.profiles.includes('admin') && ((data.profiles && !data.profiles.includes('admin')) || data.active === false);
  if (losingAdmin && (await otherActiveAdmins(id)) === 0) throw new HttpError(400, 'O sistema precisa de pelo menos um administrador ativo.');
  const nextProfiles = data.profiles || cur.profiles || [];
  if (!nextProfiles.includes('admin') && data.permissions) {
    data.permissions = data.permissions.filter(p => p !== 'gerenciar_pessoas_todas');
  }

  await tx(async (c) => {
    const sets = []; const params = [];
    for (const k of ['name', 'username', 'email', 'job_title', 'profiles', 'permissions', 'directed_sectors', 'sector_id', 'active']) {
      if (data[k] === undefined || (k === 'email' && !data[k])) continue;
      params.push(data[k]); sets.push(`${k} = $${params.length}`);
    }
    if (data.name) { params.push(initialsFrom(data.name)); sets.push(`initials = $${params.length}`); }
    if (data.active === false) sets.push('token_version = token_version + 1');
    if (sets.length) { params.push(id); await c.query(`UPDATE users SET ${sets.join(', ')} WHERE id = $${params.length}`, params); }
    if (data.team_id !== undefined) await setTeam(c, id, data.team_id);
    if (cur.entra_oid && data.active === false) await blockDirectory(c, cur.entra_oid, 'desativado');
    if (cur.entra_oid && data.active === true) await unblockDirectory(c, cur.entra_oid);
    await syncLegacy(c, id);
  });
  const { rows } = await query(`${USER_SELECT} WHERE u.id = $1`, [id]);
  res.json(listRow(rows[0]));
}));

router.post('/:id/avatar', ah(async (req, res) => {
  const s = requireScope(req);
  const id = intParam(req.params.id);
  await requireInScope(req, s, id);
  const { image } = parse(imageBody, req.body);
  await saveAvatar(id, image);
  res.json(listRow(await userPayload(id)));
}));

router.delete('/:id/avatar', ah(async (req, res) => {
  const s = requireScope(req);
  const id = intParam(req.params.id);
  await requireInScope(req, s, id);
  await removeAvatar(id);
  res.json(listRow(await userPayload(id)));
}));

// A conta sai do sistema. Tarefas, projetos e comentários ficam, sem essa pessoa.
router.delete('/:id', ah(async (req, res) => {
  const s = requireScope(req);
  const id = intParam(req.params.id);
  await requireInScope(req, s, id);
  if (id === req.user.id) throw new HttpError(400, 'Você não pode excluir a própria conta.');
  const { rows: [cur] } = await query('SELECT profiles, entra_oid FROM users WHERE id = $1', [id]);
  if (!cur) throw new HttpError(404, 'Pessoa não encontrada');
  if (cur.profiles.includes('admin') && (await otherActiveAdmins(id)) === 0) {
    throw new HttpError(400, 'O sistema precisa de pelo menos um administrador ativo.');
  }
  await removeAvatar(id);
  await tx(async (c) => {
    if (cur.entra_oid) await blockDirectory(c, cur.entra_oid, 'excluido');
    await c.query('UPDATE task_comments SET user_id = NULL WHERE user_id = $1', [id]);
    await c.query('UPDATE task_activity SET user_id = NULL WHERE user_id = $1', [id]);
    await c.query('DELETE FROM users WHERE id = $1', [id]);
  });
  res.json({ ok: true });
}));

// Define uma senha temporária; a pessoa troca no próximo acesso.
router.post('/:id/reset-password', ah(async (req, res) => {
  const s = requireScope(req);
  const id = intParam(req.params.id);
  await requireInScope(req, s, id);
  const password = String(req.body?.password || '');
  const { rows: [u] } = await query('SELECT username, entra_oid FROM users WHERE id = $1', [id]);
  if (!u) throw new HttpError(404, 'Pessoa não encontrada');
  if (u.entra_oid) throw new HttpError(400, 'Contas do diretório entram com a Microsoft. Não há senha local.');
  const problem = passwordProblem(password, u.username);
  if (problem) throw new HttpError(400, problem);
  await query(
    `UPDATE users SET password = $1, must_change_password = true, token_version = token_version + 1 WHERE id = $2`,
    [await bcrypt.hash(password, 10), id]
  );
  await query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL', [id]);
  res.json({ ok: true });
}));

module.exports = router;
