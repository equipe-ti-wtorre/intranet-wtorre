const crypto = require('crypto');
const { getPool } = require('../db/pool');

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function create(usuarioId, token, expiresAt, deviceInfo = null) {
  const pool = getPool();
  await pool.execute(
    `INSERT INTO massagem_tablet_refresh_tokens (usuario_id, token_hash, device_info, expires_at)
     VALUES (?, ?, ?, ?)`,
    [usuarioId, hashToken(token), deviceInfo, expiresAt]
  );
}

async function findValid(token) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT * FROM massagem_tablet_refresh_tokens
     WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > NOW()
     LIMIT 1`,
    [hashToken(token)]
  );
  return rows[0] || null;
}

async function revoke(token) {
  const pool = getPool();
  await pool.execute(
    `UPDATE massagem_tablet_refresh_tokens
     SET revoked_at = NOW()
     WHERE token_hash = ? AND revoked_at IS NULL`,
    [hashToken(token)]
  );
}

async function revokeAllForUser(usuarioId) {
  const pool = getPool();
  await pool.execute(
    `UPDATE massagem_tablet_refresh_tokens
     SET revoked_at = NOW()
     WHERE usuario_id = ? AND revoked_at IS NULL`,
    [usuarioId]
  );
}

module.exports = { create, findValid, revoke, revokeAllForUser, hashToken };
