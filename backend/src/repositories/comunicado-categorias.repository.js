const { getPool } = require('../db/pool');
const { slugify } = require('../utils/slug.util');

function mapCategoria(row) {
  if (!row) return null;
  return {
    id: row.id,
    nome: row.nome,
    slug: row.slug,
    cor: row.cor,
    ordem: row.ordem,
    ativo: Boolean(row.ativo),
    criado_em: row.criado_em,
    atualizado_em: row.atualizado_em,
  };
}

async function uniqueSlug(pool, baseSlug, excludeId = null) {
  let slug = baseSlug;
  let suffix = 2;
  while (true) {
    const params = excludeId != null ? [slug, excludeId] : [slug];
    const sql =
      excludeId != null
        ? 'SELECT id FROM comunicado_categorias WHERE slug = ? AND id != ? LIMIT 1'
        : 'SELECT id FROM comunicado_categorias WHERE slug = ? LIMIT 1';
    const [rows] = await pool.execute(sql, params);
    if (rows.length === 0) return slug;
    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }
}

async function listar({ apenasAtivas = false } = {}) {
  const pool = getPool();
  const where = apenasAtivas ? 'WHERE ativo = 1' : '';
  const [rows] = await pool.execute(
    `SELECT * FROM comunicado_categorias ${where} ORDER BY ordem ASC, nome ASC, id ASC`
  );
  return rows.map(mapCategoria);
}

async function buscarPorId(id) {
  const pool = getPool();
  const [rows] = await pool.execute('SELECT * FROM comunicado_categorias WHERE id = ? LIMIT 1', [id]);
  return mapCategoria(rows[0]);
}

async function buscarPorIdAtiva(id) {
  const pool = getPool();
  const [rows] = await pool.execute(
    'SELECT * FROM comunicado_categorias WHERE id = ? AND ativo = 1 LIMIT 1',
    [id]
  );
  return mapCategoria(rows[0]);
}

async function buscarPorSlug(slug) {
  const pool = getPool();
  const [rows] = await pool.execute(
    'SELECT * FROM comunicado_categorias WHERE slug = ? LIMIT 1',
    [slug]
  );
  return mapCategoria(rows[0]);
}

async function contarComunicados(categoriaId) {
  const pool = getPool();
  const [rows] = await pool.execute(
    'SELECT COUNT(*) AS total FROM comunicados WHERE categoria_id = ?',
    [categoriaId]
  );
  return Number(rows[0]?.total) || 0;
}

async function criar(data) {
  const pool = getPool();
  const baseSlug = slugify(data.nome);
  const slug = await uniqueSlug(pool, baseSlug);
  const [result] = await pool.execute(
    `INSERT INTO comunicado_categorias (nome, slug, cor, ordem, ativo)
     VALUES (?, ?, ?, ?, ?)`,
    [data.nome, slug, data.cor, data.ordem ?? 0, data.ativo ? 1 : 0]
  );
  return buscarPorId(result.insertId);
}

async function atualizar(id, data) {
  const pool = getPool();
  await pool.execute(
    `UPDATE comunicado_categorias
     SET nome = ?, cor = ?, ordem = ?, ativo = ?
     WHERE id = ?`,
    [data.nome, data.cor, data.ordem ?? 0, data.ativo ? 1 : 0, id]
  );
  return buscarPorId(id);
}

async function remover(id) {
  const pool = getPool();
  await pool.execute('DELETE FROM comunicado_categorias WHERE id = ?', [id]);
}

module.exports = {
  listar,
  buscarPorId,
  buscarPorIdAtiva,
  buscarPorSlug,
  contarComunicados,
  criar,
  atualizar,
  remover,
};
