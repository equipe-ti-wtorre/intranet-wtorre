const { getPool } = require('../db/pool');

function mapUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    nome_completo: row.nome_completo,
    email: row.email,
    departamento: row.departamento,
    setor_id: row.setor_id != null ? row.setor_id : null,
    perfil: row.perfil,
    microsoft_id: row.microsoft_id,
    is_ad_user: !!row.is_ad_user,
    ativo: !!row.ativo,
  };
}

async function findByEmail(email) {
  const pool = getPool();
  const [rows] = await pool.execute('SELECT * FROM usuarios WHERE email = ? LIMIT 1', [email]);
  return mapUser(rows[0]);
}

async function findByMicrosoftId(microsoftId) {
  const pool = getPool();
  const [rows] = await pool.execute('SELECT * FROM usuarios WHERE microsoft_id = ? LIMIT 1', [
    microsoftId,
  ]);
  return mapUser(rows[0]);
}

async function findById(id) {
  const pool = getPool();
  const [rows] = await pool.execute('SELECT * FROM usuarios WHERE id = ? LIMIT 1', [id]);
  return mapUser(rows[0]);
}

async function findByEmailWithHash(email) {
  const pool = getPool();
  const [rows] = await pool.execute('SELECT * FROM usuarios WHERE email = ? LIMIT 1', [email]);
  return rows[0] || null;
}

async function linkMicrosoft(id, microsoftId, nome, departamento) {
  const pool = getPool();
  await pool.execute(
    `UPDATE usuarios SET microsoft_id = ?, is_ad_user = 1, senha_hash = NULL,
     nome_completo = ?, departamento = ?, atualizado_em = NOW() WHERE id = ?`,
    [microsoftId, nome, departamento, id]
  );
  return findById(id);
}

async function createMicrosoftUser({ email, nome, departamento, microsoftId, username }) {
  const pool = getPool();
  const [result] = await pool.execute(
    `INSERT INTO usuarios (username, nome_completo, email, departamento, microsoft_id, is_ad_user, perfil, ativo)
     VALUES (?, ?, ?, ?, ?, 1, 'USER', 1)`,
    [username || email.split('@')[0], nome, email, departamento, microsoftId]
  );
  // Todo usuário novo já entra com o perfil "TaskHub" (se existir e estiver ativo).
  try {
    await pool.execute(
      `INSERT IGNORE INTO usuario_perfis (usuario_id, perfil_id)
       SELECT ?, id FROM perfis_acesso WHERE nome = 'TaskHub' AND ativo = 1 LIMIT 1`,
      [result.insertId]
    );
  } catch (err) {
    console.error('Falha ao vincular perfil TaskHub ao novo usuário:', err.message);
  }
  return findById(result.insertId);
}

async function updateProfile(id, nome, departamento) {
  const pool = getPool();
  await pool.execute(
    'UPDATE usuarios SET nome_completo = ?, departamento = ?, atualizado_em = NOW() WHERE id = ?',
    [nome, departamento, id]
  );
  return findById(id);
}

async function updateEmail(id, email) {
  const pool = getPool();
  await pool.execute('UPDATE usuarios SET email = ?, atualizado_em = NOW() WHERE id = ?', [
    email,
    id,
  ]);
  return findById(id);
}

async function setSetorId(id, setorId) {
  const pool = getPool();
  await pool.execute('UPDATE usuarios SET setor_id = ?, atualizado_em = NOW() WHERE id = ?', [
    setorId,
    id,
  ]);
  return findById(id);
}

async function setAtivo(id, ativo) {
  const pool = getPool();
  await pool.execute('UPDATE usuarios SET ativo = ?, atualizado_em = NOW() WHERE id = ?', [
    ativo ? 1 : 0,
    id,
  ]);
  return findById(id);
}

async function setPerfil(id, perfil) {
  const pool = getPool();
  await pool.execute('UPDATE usuarios SET perfil = ?, atualizado_em = NOW() WHERE id = ?', [
    perfil,
    id,
  ]);
  return findById(id);
}

async function countAdminsAtivos(excludeId) {
  const pool = getPool();
  const params = [];
  let sql = "SELECT COUNT(*) AS total FROM usuarios WHERE perfil = 'ADMIN' AND ativo = 1";
  if (excludeId != null) {
    sql += ' AND id != ?';
    params.push(excludeId);
  }
  const [rows] = await pool.execute(sql, params);
  return rows[0]?.total ?? 0;
}

async function deleteById(id) {
  const pool = getPool();
  await pool.execute('DELETE FROM usuarios WHERE id = ?', [id]);
}

async function listComPermissoes() {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT u.id, u.username, u.nome_completo, u.email, u.departamento,
            u.perfil, u.microsoft_id, u.is_ad_user, u.ativo
     FROM usuarios u
     WHERE u.perfil = 'ADMIN'
        OR EXISTS (SELECT 1 FROM usuario_perfis up WHERE up.usuario_id = u.id)
        OR EXISTS (SELECT 1 FROM usuario_modulos_extra ume WHERE ume.usuario_id = u.id)
     ORDER BY u.nome_completo ASC`
  );

  const permissoesRepo = require('./permissoes.repository');
  const permissoesService = require('../services/permissoes.service');
  const result = [];
  for (const row of rows) {
    const user = mapUser(row);
    const perfis = await permissoesRepo.listarPerfisDoUsuario(user.id);
    const modulos_extra = await permissoesRepo.listarModulosExtraDoUsuario(user.id);
    const modulos = await permissoesService.resolveModulos(user);
    result.push({ ...user, perfis, modulos_extra, modulos });
  }
  return result;
}

module.exports = {
  mapUser,
  findByEmail,
  findByMicrosoftId,
  findById,
  findByEmailWithHash,
  linkMicrosoft,
  createMicrosoftUser,
  updateProfile,
  updateEmail,
  setSetorId,
  setAtivo,
  setPerfil,
  countAdminsAtivos,
  deleteById,
  listComPermissoes,
};
