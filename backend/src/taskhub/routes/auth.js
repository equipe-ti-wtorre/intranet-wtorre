const router = require('express').Router();
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { query } = require('../db');
const { ah, HttpError } = require('../lib/http');
const { authenticate } = require('../middleware/auth');
const { formatUser, passwordProblem } = require('../lib/users');
const { PROFILE_SQL } = require('../lib/permissions');
const { publicConfig, verifyIdToken } = require('../lib/entra');

const ACCESS_TTL = '30m';
const REFRESH_DAYS = 30;

// Limite simples de tentativas: 10 falhas em 15 minutos por login + IP.
const failures = new Map();
function tooManyAttempts(key) {
  const now = Date.now();
  const list = (failures.get(key) || []).filter(t => now - t < 15 * 60 * 1000);
  failures.set(key, list);
  return list.length >= 10;
}
function recordFailure(key) {
  const list = failures.get(key) || [];
  list.push(Date.now());
  failures.set(key, list);
}

const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');

function signAccess(user) {
  return jwt.sign({ id: user.id, tv: user.token_version }, process.env.JWT_SECRET, { expiresIn: ACCESS_TTL });
}

async function issueRefresh(userId, userAgent) {
  const token = crypto.randomBytes(48).toString('hex');
  await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, user_agent, expires_at)
     VALUES ($1, $2, $3, NOW() + INTERVAL '${REFRESH_DAYS} days')`,
    [userId, sha256(token), String(userAgent || '').slice(0, 255)]
  );
  return token;
}

async function session(user, req) {
  const { rows: [m] } = await query(`SELECT (SELECT MIN(team_id) FROM team_members WHERE user_id = users.id) AS team_id,
    (SELECT JSON_ARRAYAGG(team_id) FROM team_members WHERE user_id = users.id) AS team_ids, ${PROFILE_SQL('users')}
    FROM users WHERE id = $1`, [user.id]);
  user = { ...user, ...m };
  return {
    token: signAccess(user),
    refresh_token: await issueRefresh(user.id, req.headers['user-agent']),
    user: formatUser(user),
  };
}

router.post('/login', ah(async (req, res) => {
  const login = String(req.body?.login || '').trim();
  const password = String(req.body?.password || '');
  if (!login || !password) throw new HttpError(400, 'Informe usuário e senha.');

  const key = `${login.toLowerCase()}|${req.ip}`;
  if (tooManyAttempts(key)) throw new HttpError(429, 'Muitas tentativas. Aguarde 15 minutos e tente de novo.');

  const { rows } = await query(
    `SELECT * FROM users WHERE LOWER(username) = LOWER($1) OR LOWER(email) = LOWER($1) LIMIT 1`,
    [login]
  );
  const user = rows[0];
  const passwordOk = !!(user?.password && await bcrypt.compare(password, user.password));
  if (!user || !passwordOk) {
    recordFailure(key);
    throw new HttpError(401, 'Usuário ou senha incorretos.');
  }
  if (user.active === false) throw new HttpError(403, 'Conta desativada. Fale com o administrador.');

  failures.delete(key);
  await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);
  res.json(await session(user, req));
}));

router.get('/microsoft/config', ah(async (req, res) => {
  res.json(await publicConfig(req));
}));

router.post('/microsoft', ah(async (req, res) => {
  const idToken = String(req.body?.id_token || '');
  if (!idToken) throw new HttpError(400, 'Token da Microsoft ausente.');
  const claims = await verifyIdToken(idToken);
  const { rows } = await query(
    `SELECT * FROM users
      WHERE entra_oid = $1 OR ($2 <> '' AND LOWER(email) = LOWER($2))
      ORDER BY (entra_oid = $1) DESC
      LIMIT 1`,
    [claims.oid, claims.email]
  );
  const user = rows[0];
  if (!user) throw new HttpError(403, 'Sua conta não está no TaskHub. Peça ao administrador para sincronizar o diretório.');
  if (user.active === false) throw new HttpError(403, 'Conta desativada. Fale com o administrador.');
  if (user.entra_oid && user.entra_oid !== claims.oid) {
    throw new HttpError(403, 'Esta conta não corresponde ao usuário da Microsoft.');
  }
  if (!user.entra_oid) {
    await query('UPDATE users SET entra_oid = $1 WHERE id = $2 AND entra_oid IS NULL', [claims.oid, user.id]);
    user.entra_oid = claims.oid;
  }
  if (user.must_change_password) {
    await query('UPDATE users SET must_change_password = false WHERE id = $1', [user.id]);
    user.must_change_password = false;
  }
  await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);
  res.json(await session(user, req));
}));

router.post('/refresh', ah(async (req, res) => {
  const token = String(req.body?.refresh_token || '');
  if (!token) throw new HttpError(401, 'Sessão expirada');
  const { rows } = await query(
    `SELECT rt.id AS rt_id, u.* FROM refresh_tokens rt JOIN users u ON u.id = rt.user_id
      WHERE rt.token_hash = $1 AND rt.revoked_at IS NULL AND rt.expires_at > NOW()`,
    [sha256(token)]
  );
  const row = rows[0];
  if (!row || row.active === false) throw new HttpError(401, 'Sessão expirada');
  // Rotação: o token usado é revogado e um novo é emitido.
  await query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1', [row.rt_id]);
  res.json(await session(row, req));
}));

router.post('/logout', ah(async (req, res) => {
  const token = String(req.body?.refresh_token || '');
  if (token) await query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1', [sha256(token)]);
  res.json({ ok: true });
}));

router.post('/logout-all', authenticate, ah(async (req, res) => {
  await query('UPDATE users SET token_version = token_version + 1 WHERE id = $1', [req.user.id]);
  await query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL', [req.user.id]);
  res.json({ ok: true });
}));

router.get('/me', authenticate, ah(async (req, res) => {
  res.json(formatUser(req.user));
}));

router.post('/change-password', authenticate, ah(async (req, res) => {
  const current = String(req.body?.current_password || '');
  const next = String(req.body?.new_password || '');
  const { rows } = await query('SELECT password, username, entra_oid FROM users WHERE id = $1', [req.user.id]);
  if (rows[0].entra_oid && !rows[0].password) throw new HttpError(400, 'Esta conta entra com a Microsoft.');
  if (!rows[0].password || !(await bcrypt.compare(current, rows[0].password))) throw new HttpError(400, 'A senha atual está incorreta.');
  const problem = passwordProblem(next, rows[0].username);
  if (problem) throw new HttpError(400, problem);
  if (current === next) throw new HttpError(400, 'A nova senha precisa ser diferente da atual.');

  const hash = await bcrypt.hash(next, 10);
  const { rows: [user] } = await query(
    `UPDATE users SET password = $1, must_change_password = false, token_version = token_version + 1
      WHERE id = $2 RETURNING *`,
    [hash, req.user.id]
  );
  // Trocar a senha encerra as outras sessões; esta recebe tokens novos.
  await query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL', [user.id]);
  res.json(await session(user, req));
}));

module.exports = router;
