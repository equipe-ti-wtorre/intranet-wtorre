const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { getPool } = require('../db/pool');
const { query } = require('./db');
const { ensureFunctions } = require('./db/functions');

async function seedAdmin() {
  const { rows } = await query(
    `SELECT id FROM users WHERE JSON_CONTAINS(profiles, '"admin"') AND NOT (active <=> 0) ORDER BY id LIMIT 1`
  );
  if (rows[0]) return;

  const username = process.env.TASKHUB_ADMIN_USER || 'admin';
  const temp = process.env.TASKHUB_ADMIN_PASSWORD || `Th${crypto.randomBytes(4).toString('hex')}9`;
  const hash = await bcrypt.hash(temp, 10);

  await query(
    `INSERT INTO users (name, email, password, initials, color, role, username, must_change_password, profiles, permissions, directed_teams, directed_sectors)
     VALUES ('Administrador', $1, $2, 'AD', '#c9a84c', 'admin', $3, 1, $4, $5, $6, $7)`,
    [`${username}@taskhub.local`, hash, username, ['admin'], [], [], []]
  );

  console.log(`[taskhub] Administrador criado. Usuário: ${username}. Senha temporária: ${temp}`);
}

async function bootstrapTaskhub() {
  const pool = getPool();
  await ensureFunctions(pool);
  await seedAdmin();
  if (process.env.TASKHUB_SCHEDULER !== 'false') {
    require('./jobs/scheduler').startScheduler();
  }
}

module.exports = { bootstrapTaskhub };
