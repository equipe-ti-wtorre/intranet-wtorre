const { getPool } = require('../db/pool');

function parseConfigJson(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function mapFonte(row) {
  if (!row) return null;
  return {
    id: row.id,
    codigo: row.codigo,
    nome: row.nome,
    url: row.url,
    parserTipo: row.parser_tipo,
    ativo: Boolean(row.ativo),
    ordem: row.ordem,
    limite: row.limite != null ? Number(row.limite) : null,
    configJson: parseConfigJson(row.config_json),
    logoUrl: row.logo_url || null,
    rotulo: row.rotulo || null,
    criadoEm: row.criado_em,
    atualizadoEm: row.atualizado_em,
  };
}

async function listarAtivas() {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT * FROM eventos_fontes
     WHERE ativo = 1
     ORDER BY ordem ASC, id ASC`
  );
  return rows.map(mapFonte);
}

async function listarAdmin({ busca } = {}) {
  const pool = getPool();
  const conditions = [];
  const params = [];

  if (busca?.trim()) {
    conditions.push('(nome LIKE ? OR url LIKE ? OR codigo LIKE ?)');
    const term = `%${busca.trim()}%`;
    params.push(term, term, term);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const [rows] = await pool.execute(
    `SELECT * FROM eventos_fontes ${where} ORDER BY ordem ASC, id ASC`,
    params
  );
  return rows.map(mapFonte);
}

async function buscarPorId(id) {
  const pool = getPool();
  const [rows] = await pool.execute('SELECT * FROM eventos_fontes WHERE id = ? LIMIT 1', [id]);
  return mapFonte(rows[0]);
}

async function buscarPorCodigo(codigo) {
  const pool = getPool();
  const [rows] = await pool.execute('SELECT * FROM eventos_fontes WHERE codigo = ? LIMIT 1', [
    codigo,
  ]);
  return mapFonte(rows[0]);
}

async function criar(data) {
  const pool = getPool();
  const configJson = data.configJson != null ? JSON.stringify(data.configJson) : null;
  const [result] = await pool.execute(
    `INSERT INTO eventos_fontes (codigo, nome, url, parser_tipo, ativo, ordem, limite, config_json, logo_url, rotulo)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.codigo,
      data.nome,
      data.url,
      data.parserTipo,
      data.ativo ? 1 : 0,
      data.ordem ?? 0,
      data.limite ?? null,
      configJson,
      data.logoUrl ?? null,
      data.rotulo ?? null,
    ]
  );
  return buscarPorId(result.insertId);
}

async function atualizar(id, data) {
  const pool = getPool();
  const configJson = data.configJson !== undefined ? JSON.stringify(data.configJson) : undefined;
  const fields = [];
  const params = [];

  if (data.nome !== undefined) {
    fields.push('nome = ?');
    params.push(data.nome);
  }
  if (data.url !== undefined) {
    fields.push('url = ?');
    params.push(data.url);
  }
  if (data.parserTipo !== undefined) {
    fields.push('parser_tipo = ?');
    params.push(data.parserTipo);
  }
  if (data.ativo !== undefined) {
    fields.push('ativo = ?');
    params.push(data.ativo ? 1 : 0);
  }
  if (data.ordem !== undefined) {
    fields.push('ordem = ?');
    params.push(data.ordem);
  }
  if (data.limite !== undefined) {
    fields.push('limite = ?');
    params.push(data.limite);
  }
  if (configJson !== undefined) {
    fields.push('config_json = ?');
    params.push(configJson);
  }
  if (data.logoUrl !== undefined) {
    fields.push('logo_url = ?');
    params.push(data.logoUrl || null);
  }
  if (data.rotulo !== undefined) {
    fields.push('rotulo = ?');
    params.push(data.rotulo || null);
  }

  if (!fields.length) return buscarPorId(id);

  params.push(id);
  await pool.execute(`UPDATE eventos_fontes SET ${fields.join(', ')} WHERE id = ?`, params);
  return buscarPorId(id);
}

async function remover(id) {
  const pool = getPool();
  await pool.execute('DELETE FROM eventos_fontes WHERE id = ?', [id]);
}

module.exports = {
  listarAtivas,
  listarAdmin,
  buscarPorId,
  buscarPorCodigo,
  criar,
  atualizar,
  remover,
  mapFonte,
};
