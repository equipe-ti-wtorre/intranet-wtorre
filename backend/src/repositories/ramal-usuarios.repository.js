const { getPool } = require('../db/pool');

function mapUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    nome: row.nome,
    perfil: row.perfil === 'ADMIN' ? 'ADMIN' : 'USER',
    ativo: !!row.ativo,
    criado_em: row.criado_em,
    atualizado_em: row.atualizado_em,
  };
}

async function findById(id) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT id, username, nome, perfil, ativo, criado_em, atualizado_em
     FROM ramal_usuarios WHERE id = ? LIMIT 1`,
    [id]
  );
  return mapUser(rows[0]);
}

async function findByUsernameWithHash(username) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT id, username, nome, senha_hash, perfil, ativo, criado_em, atualizado_em
     FROM ramal_usuarios WHERE username = ? LIMIT 1`,
    [username]
  );
  return rows[0] || null;
}

async function listAll() {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT id, username, nome, perfil, ativo, criado_em, atualizado_em
     FROM ramal_usuarios
     ORDER BY username ASC`
  );
  return rows.map(mapUser);
}

async function countAtivos() {
  const pool = getPool();
  const [rows] = await pool.execute(
    'SELECT COUNT(*) AS total FROM ramal_usuarios WHERE ativo = 1'
  );
  return Number(rows[0]?.total || 0);
}

async function countAdminsAtivos(excludeId = null) {
  const pool = getPool();
  if (excludeId != null) {
    const [rows] = await pool.execute(
      `SELECT COUNT(*) AS total FROM ramal_usuarios
       WHERE ativo = 1 AND perfil = 'ADMIN' AND id <> ?`,
      [excludeId]
    );
    return Number(rows[0]?.total || 0);
  }
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS total FROM ramal_usuarios
     WHERE ativo = 1 AND perfil = 'ADMIN'`
  );
  return Number(rows[0]?.total || 0);
}

async function create({ username, nome, senhaHash, perfil }) {
  const pool = getPool();
  const [result] = await pool.execute(
    `INSERT INTO ramal_usuarios (username, nome, senha_hash, perfil, ativo)
     VALUES (?, ?, ?, ?, 1)`,
    [username, nome, senhaHash, perfil === 'ADMIN' ? 'ADMIN' : 'USER']
  );
  return findById(result.insertId);
}

async function update(id, { username, nome, perfil, ativo }) {
  const pool = getPool();
  await pool.execute(
    `UPDATE ramal_usuarios
     SET username = ?, nome = ?, perfil = ?, ativo = ?
     WHERE id = ?`,
    [
      username,
      nome,
      perfil === 'ADMIN' ? 'ADMIN' : 'USER',
      ativo ? 1 : 0,
      id,
    ]
  );
  return findById(id);
}

async function updateSenha(id, senhaHash) {
  const pool = getPool();
  await pool.execute('UPDATE ramal_usuarios SET senha_hash = ? WHERE id = ?', [
    senhaHash,
    id,
  ]);
  return findById(id);
}

async function remove(id) {
  const pool = getPool();
  await pool.execute('DELETE FROM ramal_usuarios WHERE id = ?', [id]);
}

module.exports = {
  mapUser,
  findById,
  findByUsernameWithHash,
  listAll,
  countAtivos,
  countAdminsAtivos,
  create,
  update,
  updateSenha,
  remove,
};
