const { getPool } = require('../db/pool');

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** DATETIME gravado como relógio UTC (YYYY-MM-DD HH:mm:ss). */
function toMysqlUtc(iso) {
  if (!iso) return null;
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * mysql2 interpreta DATETIME no fuso do processo. Reconstrói ISO UTC
 * a partir dos componentes locais, que batem com o relógio gravado.
 */
function toIsoUtc(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return (
      `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}` +
      `T${pad2(value.getHours())}:${pad2(value.getMinutes())}:${pad2(value.getSeconds())}.000Z`
    );
  }
  const s = String(value).trim();
  if (!s) return null;
  if (s.includes('T') || /[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return `${s.replace(' ', 'T')}.000Z`;
}

function mapDispositivo(row) {
  if (!row) return null;
  return {
    id: row.id,
    rustdesk_id: String(row.rustdesk_id),
    hostname: row.hostname || null,
    entidade_id: row.entidade_id != null ? Number(row.entidade_id) : null,
    entidade_nome: row.entidade_nome || null,
    setor: row.setor || null,
    tipo: row.tipo || null,
    localizacao: row.localizacao || null,
    modo_acesso: row.modo_acesso || null,
    cofre_ref: row.cofre_ref || null,
    servico_estado: row.servico_estado || null,
    versao_cliente: row.versao_cliente || null,
    observacao: row.observacao || null,
    criado_em_hbbs: toIsoUtc(row.criado_em_hbbs),
    ultimo_registro: toIsoUtc(row.ultimo_registro),
    presente_no_hbbs: !!row.presente_no_hbbs,
    ativo: !!row.ativo,
    criado_em: row.criado_em || null,
    atualizado_em: row.atualizado_em || null,
  };
}

function mapOrfao(row) {
  if (!row) return null;
  return {
    rustdesk_id: String(row.rustdesk_id),
    criado_em_hbbs: toIsoUtc(row.criado_em_hbbs),
    ultimo_registro: toIsoUtc(row.ultimo_registro),
    primeiro_visto_em: row.primeiro_visto_em || null,
    atualizado_em: row.atualizado_em || null,
  };
}

function mapSyncLog(row) {
  if (!row) return null;
  return {
    id: row.id,
    iniciado_em: row.iniciado_em,
    finalizado_em: row.finalizado_em || null,
    sucesso: !!row.sucesso,
    peers_lidos: Number(row.peers_lidos) || 0,
    dispositivos_atualizados: Number(row.dispositivos_atualizados) || 0,
    orfaos_novos: Number(row.orfaos_novos) || 0,
    mensagem_erro: row.mensagem_erro || null,
  };
}

const SELECT_DISPOSITIVO = `
  SELECT d.*, p.nome AS entidade_nome
  FROM rustdesk_dispositivo d
  LEFT JOIN documentos_paginas p ON p.id = d.entidade_id
`;

async function findById(id) {
  const pool = getPool();
  const [rows] = await pool.execute(`${SELECT_DISPOSITIVO} WHERE d.id = ? LIMIT 1`, [id]);
  return mapDispositivo(rows[0]);
}

async function findByRustdeskId(rustdeskId) {
  const pool = getPool();
  const [rows] = await pool.execute(`${SELECT_DISPOSITIVO} WHERE d.rustdesk_id = ? LIMIT 1`, [
    String(rustdeskId),
  ]);
  return mapDispositivo(rows[0]);
}

async function listDispositivos({ busca, entidadeId, tipo, ativo, page = 1, pageSize = 20 } = {}) {
  const pool = getPool();
  const where = [];
  const params = [];

  if (ativo === true || ativo === false) {
    where.push('d.ativo = ?');
    params.push(ativo ? 1 : 0);
  }
  if (entidadeId != null && entidadeId !== '') {
    where.push('d.entidade_id = ?');
    params.push(Number(entidadeId));
  }
  if (tipo) {
    where.push('d.tipo = ?');
    params.push(String(tipo));
  }
  if (busca) {
    const q = `%${String(busca).trim()}%`;
    where.push(
      '(d.rustdesk_id LIKE ? OR d.hostname LIKE ? OR d.setor LIKE ? OR d.localizacao LIKE ? OR p.nome LIKE ?)'
    );
    params.push(q, q, q, q, q);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [countRows] = await pool.execute(
    `SELECT COUNT(*) AS total FROM rustdesk_dispositivo d LEFT JOIN documentos_paginas p ON p.id = d.entidade_id ${whereSql}`,
    params
  );
  const total = Number(countRows[0]?.total) || 0;

  const limit = Math.min(100, Math.max(1, Number(pageSize) || 20));
  const pageNum = Math.max(1, Number(page) || 1);
  const offset = (pageNum - 1) * limit;

  const [rows] = await pool.execute(
    `${SELECT_DISPOSITIVO} ${whereSql} ORDER BY d.hostname IS NULL, d.hostname, d.id LIMIT ${limit} OFFSET ${offset}`,
    params
  );

  return { total, page: pageNum, pageSize: limit, itens: rows.map(mapDispositivo) };
}

async function createDispositivo(data) {
  const pool = getPool();
  const [result] = await pool.execute(
    `INSERT INTO rustdesk_dispositivo (
      rustdesk_id, hostname, entidade_id, setor, tipo, localizacao, modo_acesso,
      cofre_ref, servico_estado, versao_cliente, observacao, criado_em_hbbs,
      ultimo_registro, presente_no_hbbs, ativo
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      String(data.rustdesk_id),
      data.hostname || null,
      data.entidade_id ?? null,
      data.setor || null,
      data.tipo || null,
      data.localizacao || null,
      data.modo_acesso || null,
      data.cofre_ref || null,
      data.servico_estado || null,
      data.versao_cliente || null,
      data.observacao || null,
      toMysqlUtc(data.criado_em_hbbs),
      toMysqlUtc(data.ultimo_registro),
      data.presente_no_hbbs ? 1 : 0,
      data.ativo === false ? 0 : 1,
    ]
  );
  return findById(result.insertId);
}

async function updateDispositivo(id, data) {
  const pool = getPool();
  const fields = [];
  const params = [];
  const map = {
    hostname: data.hostname,
    entidade_id: data.entidade_id,
    setor: data.setor,
    tipo: data.tipo,
    localizacao: data.localizacao,
    modo_acesso: data.modo_acesso,
    cofre_ref: data.cofre_ref,
    servico_estado: data.servico_estado,
    versao_cliente: data.versao_cliente,
    observacao: data.observacao,
    presente_no_hbbs: data.presente_no_hbbs,
    ativo: data.ativo,
  };

  for (const [col, val] of Object.entries(map)) {
    if (val === undefined) continue;
    if (col === 'entidade_id') {
      fields.push('entidade_id = ?');
      params.push(val === null || val === '' ? null : Number(val));
    } else if (col === 'presente_no_hbbs' || col === 'ativo') {
      fields.push(`${col} = ?`);
      params.push(val ? 1 : 0);
    } else {
      fields.push(`${col} = ?`);
      params.push(val === '' ? null : val);
    }
  }

  if (data.criado_em_hbbs !== undefined) {
    fields.push('criado_em_hbbs = ?');
    params.push(toMysqlUtc(data.criado_em_hbbs));
  }
  if (data.ultimo_registro !== undefined) {
    fields.push('ultimo_registro = ?');
    params.push(toMysqlUtc(data.ultimo_registro));
  }

  if (!fields.length) return findById(id);
  params.push(id);
  await pool.execute(`UPDATE rustdesk_dispositivo SET ${fields.join(', ')} WHERE id = ?`, params);
  return findById(id);
}

async function softDelete(id) {
  const pool = getPool();
  await pool.execute('UPDATE rustdesk_dispositivo SET ativo = 0 WHERE id = ?', [id]);
  return findById(id);
}

async function listIdsCadastrados() {
  const pool = getPool();
  const [rows] = await pool.execute('SELECT rustdesk_id FROM rustdesk_dispositivo');
  return new Set(rows.map((r) => String(r.rustdesk_id)));
}

async function marcarTodosAusentesHbbs() {
  const pool = getPool();
  await pool.execute('UPDATE rustdesk_dispositivo SET presente_no_hbbs = 0');
}

async function atualizarDoPeer(rustdeskId, { criadoEm, ultimoRegistro }) {
  const pool = getPool();
  const [result] = await pool.execute(
    `UPDATE rustdesk_dispositivo
     SET ultimo_registro = ?, criado_em_hbbs = COALESCE(criado_em_hbbs, ?), presente_no_hbbs = 1
     WHERE rustdesk_id = ?`,
    [toMysqlUtc(ultimoRegistro), toMysqlUtc(criadoEm), String(rustdeskId)]
  );
  return result.affectedRows || 0;
}

async function upsertOrfao({ rustdeskId, criadoEm, ultimoRegistro }) {
  const pool = getPool();
  const [existing] = await pool.execute(
    'SELECT rustdesk_id FROM rustdesk_peer_orfao WHERE rustdesk_id = ? LIMIT 1',
    [String(rustdeskId)]
  );
  const isNew = !existing.length;
  await pool.execute(
    `INSERT INTO rustdesk_peer_orfao (rustdesk_id, criado_em_hbbs, ultimo_registro)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE criado_em_hbbs = VALUES(criado_em_hbbs), ultimo_registro = VALUES(ultimo_registro)`,
    [String(rustdeskId), toMysqlUtc(criadoEm), toMysqlUtc(ultimoRegistro)]
  );
  return isNew;
}

async function removeOrfao(rustdeskId) {
  const pool = getPool();
  await pool.execute('DELETE FROM rustdesk_peer_orfao WHERE rustdesk_id = ?', [String(rustdeskId)]);
}

async function listOrfaos() {
  const pool = getPool();
  const [rows] = await pool.execute(
    'SELECT * FROM rustdesk_peer_orfao ORDER BY primeiro_visto_em DESC'
  );
  return rows.map(mapOrfao);
}

async function findOrfao(rustdeskId) {
  const pool = getPool();
  const [rows] = await pool.execute(
    'SELECT * FROM rustdesk_peer_orfao WHERE rustdesk_id = ? LIMIT 1',
    [String(rustdeskId)]
  );
  return mapOrfao(rows[0]);
}

async function insertSyncLog({
  sucesso,
  peersLidos = 0,
  dispositivosAtualizados = 0,
  orfaosNovos = 0,
  mensagemErro = null,
  iniciadoEm,
}) {
  const pool = getPool();
  const [result] = await pool.execute(
    `INSERT INTO rustdesk_sync_log
      (iniciado_em, finalizado_em, sucesso, peers_lidos, dispositivos_atualizados, orfaos_novos, mensagem_erro)
     VALUES (?, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?)`,
    [
      iniciadoEm || new Date(),
      sucesso ? 1 : 0,
      Number(peersLidos) || 0,
      Number(dispositivosAtualizados) || 0,
      Number(orfaosNovos) || 0,
      mensagemErro || null,
    ]
  );
  const [rows] = await pool.execute('SELECT * FROM rustdesk_sync_log WHERE id = ? LIMIT 1', [
    result.insertId,
  ]);
  return mapSyncLog(rows[0]);
}

async function ultimaSync() {
  const pool = getPool();
  const [rows] = await pool.execute(
    'SELECT * FROM rustdesk_sync_log ORDER BY id DESC LIMIT 1'
  );
  return mapSyncLog(rows[0]);
}

async function listSyncLog(limit = 10) {
  const pool = getPool();
  const lim = Math.min(50, Math.max(1, Number(limit) || 10));
  const [rows] = await pool.execute(
    `SELECT * FROM rustdesk_sync_log ORDER BY id DESC LIMIT ${lim}`
  );
  return rows.map(mapSyncLog);
}

async function findEntidadeById(id) {
  const pool = getPool();
  const [rows] = await pool.execute(
    'SELECT id, nome, slug FROM documentos_paginas WHERE id = ? AND ativo = 1 LIMIT 1',
    [id]
  );
  return rows[0] || null;
}

async function findEntidadeByNomeOuSlug(valor) {
  const pool = getPool();
  const v = String(valor).trim();
  if (!v) return null;
  const [rows] = await pool.execute(
    `SELECT id, nome, slug FROM documentos_paginas
     WHERE ativo = 1 AND (slug = ? OR nome = ?)
     LIMIT 1`,
    [v.toLowerCase(), v]
  );
  if (rows[0]) return rows[0];
  const [rows2] = await pool.execute(
    `SELECT id, nome, slug FROM documentos_paginas
     WHERE ativo = 1 AND LOWER(nome) = LOWER(?)
     LIMIT 1`,
    [v]
  );
  return rows2[0] || null;
}

module.exports = {
  toMysqlUtc,
  toIsoUtc,
  findById,
  findByRustdeskId,
  listDispositivos,
  createDispositivo,
  updateDispositivo,
  softDelete,
  listIdsCadastrados,
  marcarTodosAusentesHbbs,
  atualizarDoPeer,
  upsertOrfao,
  removeOrfao,
  listOrfaos,
  findOrfao,
  insertSyncLog,
  ultimaSync,
  listSyncLog,
  findEntidadeById,
  findEntidadeByNomeOuSlug,
};
