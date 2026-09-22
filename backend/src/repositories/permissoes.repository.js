const { getPool } = require('../db/pool');
const { MODULOS } = require('../config/modulos-admin');

function erroFkModulo(err) {
  if (err.code === 'ER_NO_REFERENCED_ROW_2' || err.errno === 1452) {
    const e = new Error('Um ou mais módulos não existem no catálogo do banco.');
    e.status = 400;
    return e;
  }
  return err;
}

async function remapCipaParaAgendaRh(executor) {
  const [rows] = await executor.execute(
    "SELECT codigo FROM modulos_admin WHERE codigo = 'cipa' LIMIT 1"
  );
  if (!rows.length) return;

  await executor.execute(
    `INSERT IGNORE INTO modulos_admin (codigo, nome, ordem)
     SELECT 'agenda_rh', 'Agenda RH', ordem FROM modulos_admin WHERE codigo = 'cipa'`
  );
  await executor.execute(
    "INSERT IGNORE INTO modulos_admin (codigo, nome, ordem) VALUES ('agenda_rh', 'Agenda RH', 19)"
  );
  await executor.execute(
    `INSERT IGNORE INTO perfil_modulos (perfil_id, modulo_codigo)
     SELECT perfil_id, 'agenda_rh' FROM perfil_modulos WHERE modulo_codigo = 'cipa'`
  );
  await executor.execute(
    `INSERT IGNORE INTO usuario_modulos_extra (usuario_id, modulo_codigo)
     SELECT usuario_id, 'agenda_rh' FROM usuario_modulos_extra WHERE modulo_codigo = 'cipa'`
  );
  await executor.execute("DELETE FROM perfil_modulos WHERE modulo_codigo = 'cipa'");
  await executor.execute("DELETE FROM usuario_modulos_extra WHERE modulo_codigo = 'cipa'");
  await executor.execute("DELETE FROM modulos_admin WHERE codigo = 'cipa'");
}

async function sincronizarCatalogoModulos() {
  const pool = getPool();
  await remapCipaParaAgendaRh(pool);

  const placeholders = MODULOS.map(() => '(?, ?, ?)').join(', ');
  const values = MODULOS.flatMap((m) => [m.codigo, m.nome, m.ordem]);
  await pool.execute(
    `INSERT INTO modulos_admin (codigo, nome, ordem) VALUES ${placeholders}
     ON DUPLICATE KEY UPDATE nome = VALUES(nome), ordem = VALUES(ordem)`,
    values
  );
}

function mapPerfil(row, modulos = []) {
  if (!row) return null;
  return {
    id: row.id,
    nome: row.nome,
    descricao: row.descricao,
    ativo: !!row.ativo,
    criado_em: row.criado_em,
    modulos,
    usuarios_vinculados: row.usuarios_vinculados != null ? Number(row.usuarios_vinculados) : undefined,
  };
}

async function listarPerfis() {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT p.*,
            (SELECT COUNT(*) FROM usuario_perfis up WHERE up.perfil_id = p.id) AS usuarios_vinculados
     FROM perfis_acesso p
     ORDER BY p.nome ASC`
  );

  const perfis = [];
  for (const row of rows) {
    const modulos = await listarModulosDoPerfil(row.id);
    perfis.push(mapPerfil(row, modulos));
  }
  return perfis;
}

async function findPerfilById(id) {
  const pool = getPool();
  const [rows] = await pool.execute('SELECT * FROM perfis_acesso WHERE id = ? LIMIT 1', [id]);
  if (!rows[0]) return null;
  const modulos = await listarModulosDoPerfil(id);
  return mapPerfil(rows[0], modulos);
}

async function createPerfil({ nome, descricao, ativo = true }) {
  const pool = getPool();
  const [result] = await pool.execute(
    'INSERT INTO perfis_acesso (nome, descricao, ativo) VALUES (?, ?, ?)',
    [nome, descricao || null, ativo ? 1 : 0]
  );
  return findPerfilById(result.insertId);
}

async function updatePerfil(id, { nome, descricao, ativo }) {
  const pool = getPool();
  await pool.execute(
    'UPDATE perfis_acesso SET nome = ?, descricao = ?, ativo = ? WHERE id = ?',
    [nome, descricao || null, ativo ? 1 : 0, id]
  );
  return findPerfilById(id);
}

async function deletePerfil(id) {
  const pool = getPool();
  await pool.execute('DELETE FROM perfis_acesso WHERE id = ?', [id]);
}

async function listarModulosDoPerfil(perfilId) {
  const pool = getPool();
  const [rows] = await pool.execute(
    'SELECT modulo_codigo FROM perfil_modulos WHERE perfil_id = ? ORDER BY modulo_codigo',
    [perfilId]
  );
  return rows.map((r) => r.modulo_codigo);
}

async function setModulosDoPerfil(perfilId, codigos) {
  await sincronizarCatalogoModulos();
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute('DELETE FROM perfil_modulos WHERE perfil_id = ?', [perfilId]);
    for (const codigo of codigos) {
      await conn.execute(
        'INSERT INTO perfil_modulos (perfil_id, modulo_codigo) VALUES (?, ?)',
        [perfilId, codigo]
      );
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw erroFkModulo(e);
  } finally {
    conn.release();
  }
}

async function setPerfisDoUsuario(usuarioId, perfilIds) {
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute('DELETE FROM usuario_perfis WHERE usuario_id = ?', [usuarioId]);
    for (const perfilId of perfilIds) {
      await conn.execute('INSERT INTO usuario_perfis (usuario_id, perfil_id) VALUES (?, ?)', [
        usuarioId,
        perfilId,
      ]);
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

async function setModulosExtra(usuarioId, codigos) {
  await sincronizarCatalogoModulos();
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute('DELETE FROM usuario_modulos_extra WHERE usuario_id = ?', [usuarioId]);
    for (const codigo of codigos) {
      await conn.execute(
        'INSERT INTO usuario_modulos_extra (usuario_id, modulo_codigo) VALUES (?, ?)',
        [usuarioId, codigo]
      );
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw erroFkModulo(e);
  } finally {
    conn.release();
  }
}

async function resolverModulosDoUsuario(usuarioId) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT DISTINCT modulo_codigo FROM (
       SELECT pm.modulo_codigo
       FROM usuario_perfis up
       INNER JOIN perfis_acesso pa ON pa.id = up.perfil_id AND pa.ativo = 1
       INNER JOIN perfil_modulos pm ON pm.perfil_id = pa.id
       WHERE up.usuario_id = ?
       UNION
       SELECT ume.modulo_codigo
       FROM usuario_modulos_extra ume
       WHERE ume.usuario_id = ?
     ) AS modulos_efetivos
     ORDER BY modulo_codigo`,
    [usuarioId, usuarioId]
  );
  return rows.map((r) => r.modulo_codigo);
}

async function contarUsuariosDoPerfil(perfilId) {
  const pool = getPool();
  const [rows] = await pool.execute(
    'SELECT COUNT(*) AS total FROM usuario_perfis WHERE perfil_id = ?',
    [perfilId]
  );
  return Number(rows[0]?.total ?? 0);
}

async function listarUsuariosAfetadosPorPerfil(perfilId) {
  const pool = getPool();
  const [rows] = await pool.execute(
    'SELECT DISTINCT usuario_id FROM usuario_perfis WHERE perfil_id = ?',
    [perfilId]
  );
  return rows.map((r) => r.usuario_id);
}

async function listarPerfisDoUsuario(usuarioId) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT p.id, p.nome, p.descricao, p.ativo
     FROM usuario_perfis up
     INNER JOIN perfis_acesso p ON p.id = up.perfil_id
     WHERE up.usuario_id = ?
     ORDER BY p.nome`,
    [usuarioId]
  );
  return rows.map((r) => ({ id: r.id, nome: r.nome, descricao: r.descricao, ativo: !!r.ativo }));
}

async function listarModulosExtraDoUsuario(usuarioId) {
  const pool = getPool();
  const [rows] = await pool.execute(
    'SELECT modulo_codigo FROM usuario_modulos_extra WHERE usuario_id = ? ORDER BY modulo_codigo',
    [usuarioId]
  );
  return rows.map((r) => r.modulo_codigo);
}

module.exports = {
  listarPerfis,
  findPerfilById,
  createPerfil,
  updatePerfil,
  deletePerfil,
  listarModulosDoPerfil,
  setModulosDoPerfil,
  setPerfisDoUsuario,
  setModulosExtra,
  resolverModulosDoUsuario,
  contarUsuariosDoPerfil,
  listarUsuariosAfetadosPorPerfil,
  listarPerfisDoUsuario,
  listarModulosExtraDoUsuario,
  sincronizarCatalogoModulos,
};
