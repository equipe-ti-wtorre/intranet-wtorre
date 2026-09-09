const { getPool } = require('../db/pool');

const SELECT_USER = `u.id, u.username, u.nome, u.ativo, u.perfil, u.empresa_id,
       u.criado_em, u.atualizado_em, e.nm AS empresa_nm`;

function mapUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    nome: row.nome,
    perfil: row.perfil === 'ADMIN' ? 'ADMIN' : 'USER',
    empresaId: row.empresa_id != null ? Number(row.empresa_id) : null,
    empresaNm: row.empresa_nm || null,
    ativo: !!row.ativo,
    criado_em: row.criado_em,
    atualizado_em: row.atualizado_em,
  };
}

async function findById(id) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT ${SELECT_USER}
     FROM massagem_tablet_usuarios u
     LEFT JOIN massagem_empresas e ON e.id = u.empresa_id
     WHERE u.id = ? LIMIT 1`,
    [id]
  );
  return mapUser(rows[0]);
}

async function findByUsernameWithHash(username) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT ${SELECT_USER}, u.senha_hash
     FROM massagem_tablet_usuarios u
     LEFT JOIN massagem_empresas e ON e.id = u.empresa_id
     WHERE u.username = ? LIMIT 1`,
    [username]
  );
  return rows[0] || null;
}

async function listAll() {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT ${SELECT_USER}
     FROM massagem_tablet_usuarios u
     LEFT JOIN massagem_empresas e ON e.id = u.empresa_id
     ORDER BY u.username ASC`
  );
  return rows.map(mapUser);
}

async function countAtivos() {
  const pool = getPool();
  const [rows] = await pool.execute(
    'SELECT COUNT(*) AS total FROM massagem_tablet_usuarios WHERE ativo = 1'
  );
  return Number(rows[0]?.total || 0);
}

async function countAdminsAtivos(excludeId = null) {
  const pool = getPool();
  if (excludeId != null) {
    const [rows] = await pool.execute(
      `SELECT COUNT(*) AS total FROM massagem_tablet_usuarios
       WHERE ativo = 1 AND perfil = 'ADMIN' AND id <> ?`,
      [excludeId]
    );
    return Number(rows[0]?.total || 0);
  }
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS total FROM massagem_tablet_usuarios
     WHERE ativo = 1 AND perfil = 'ADMIN'`
  );
  return Number(rows[0]?.total || 0);
}

async function create({ username, nome, senhaHash, perfil, empresaId }) {
  const pool = getPool();
  const [result] = await pool.execute(
    `INSERT INTO massagem_tablet_usuarios (username, nome, senha_hash, perfil, empresa_id, ativo)
     VALUES (?, ?, ?, ?, ?, 1)`,
    [
      username,
      nome,
      senhaHash,
      perfil === 'ADMIN' ? 'ADMIN' : 'USER',
      empresaId != null ? empresaId : null,
    ]
  );
  return findById(result.insertId);
}

async function update(id, { username, nome, perfil, empresaId, ativo }) {
  const pool = getPool();
  await pool.execute(
    `UPDATE massagem_tablet_usuarios
     SET username = ?, nome = ?, perfil = ?, empresa_id = ?, ativo = ?
     WHERE id = ?`,
    [
      username,
      nome,
      perfil === 'ADMIN' ? 'ADMIN' : 'USER',
      empresaId != null ? empresaId : null,
      ativo ? 1 : 0,
      id,
    ]
  );
  return findById(id);
}

async function updateSenha(id, senhaHash) {
  const pool = getPool();
  await pool.execute(
    'UPDATE massagem_tablet_usuarios SET senha_hash = ? WHERE id = ?',
    [senhaHash, id]
  );
  return findById(id);
}

async function remove(id) {
  const pool = getPool();
  await pool.execute('DELETE FROM massagem_tablet_usuarios WHERE id = ?', [id]);
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
