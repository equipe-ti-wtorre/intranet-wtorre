const { getPool } = require('../db/pool');
const { decodeBlobRef } = require('../utils/solicitacao-validation.util');

function parseJson(value, fallback = null) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function mapSolicitacao(row) {
  if (!row) return null;
  return {
    id: row.id,
    solicitante_usuario_id: row.solicitante_usuario_id,
    solicitante_nome: row.solicitante_nome,
    solicitante_email: row.solicitante_email,
    tipo: row.tipo,
    nome: row.nome,
    sobrenome: row.sobrenome,
    genero: row.genero,
    email_novo: row.email_novo,
    data_nascimento: row.data_nascimento ? String(row.data_nascimento).slice(0, 10) : null,
    cpf: row.cpf,
    rg: row.rg,
    departamento: row.departamento,
    cargo: row.cargo,
    supervisor: row.supervisor,
    centro_custo: row.centro_custo,
    empresa: row.empresa,
    local_trabalho: row.local_trabalho,
    foto_url: row.foto_url,
    boas_vindas_url: row.boas_vindas_url,
    cracha_url: row.cracha_url,
    credencial_veiculo_url: row.credencial_veiculo_url,
    precisa_ramal: !!row.precisa_ramal,
    precisa_celular: !!row.precisa_celular,
    equipamento: row.equipamento,
    credencial_estacionamento: !!row.credencial_estacionamento,
    data_inicio: row.data_inicio ? String(row.data_inicio).slice(0, 10) : null,
    status: row.status,
    criado_em: row.criado_em,
    criado_por: row.criado_por,
  };
}

function mapGrupo(row) {
  if (!row) return null;
  return {
    id: row.id,
    nome: row.nome,
    destinatarios: parseJson(row.destinatarios, []),
    campos: parseJson(row.campos, []),
    assunto: row.assunto ?? null,
    ativo: !!row.ativo,
    ordem: row.ordem,
    criado_em: row.criado_em,
  };
}

function mapEmailIndividual(row) {
  if (!row) return null;
  return {
    id: row.id,
    nome: row.nome ?? null,
    email: row.email,
    assunto: row.assunto ?? null,
    campos: parseJson(row.campos, []),
    ativo: !!row.ativo,
    ordem: row.ordem,
    criado_em: row.criado_em,
  };
}

function mapEnvio(row) {
  if (!row) return null;
  return {
    id: row.id,
    solicitacao_id: row.solicitacao_id,
    grupo_id: row.grupo_id,
    email_individual_id: row.email_individual_id ?? null,
    grupo_nome: row.grupo_nome,
    destinatarios: parseJson(row.destinatarios, []),
    status: row.status,
    erro: row.erro,
    message_id: row.message_id,
    enviado_em: row.enviado_em,
  };
}

function mapVisualizador(row) {
  if (!row) return null;
  return {
    usuario_id: row.usuario_id,
    nome_completo: row.nome_completo,
    email: row.email,
    departamento: row.departamento,
    criado_em: row.criado_em,
  };
}

async function createSolicitacao(data) {
  const pool = getPool();
  const [result] = await pool.execute(
    `INSERT INTO solicitacoes_colaborador (
      solicitante_usuario_id, solicitante_nome, solicitante_email, tipo,
      nome, sobrenome, genero, email_novo, data_nascimento, cpf, rg,
      departamento, cargo, supervisor, centro_custo, empresa, local_trabalho,
      foto_url, boas_vindas_url, cracha_url, credencial_veiculo_url,
      precisa_ramal, precisa_celular, equipamento, credencial_estacionamento,
      data_inicio, status, criado_por
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.solicitante_usuario_id ?? null,
      data.solicitante_nome ?? data.solicitante ?? null,
      data.solicitante_email ?? null,
      data.tipo ?? null,
      data.nome ?? null,
      data.sobrenome ?? null,
      data.genero ?? null,
      data.email_novo ?? null,
      data.data_nascimento ?? null,
      data.cpf ?? null,
      data.rg ?? null,
      data.departamento ?? null,
      data.cargo ?? null,
      data.supervisor ?? null,
      data.centro_custo ?? null,
      data.empresa ?? null,
      data.local_trabalho ?? null,
      data.foto_url ?? null,
      data.boas_vindas_url ?? null,
      data.cracha_url ?? null,
      data.credencial_veiculo_url ?? null,
      data.precisa_ramal ? 1 : 0,
      data.precisa_celular ? 1 : 0,
      data.equipamento ?? null,
      data.credencial_estacionamento ? 1 : 0,
      data.data_inicio ?? null,
      data.status || 'recebida',
      data.criado_por ?? null,
    ]
  );
  return findSolicitacaoById(result.insertId);
}

async function findSolicitacaoById(id) {
  const pool = getPool();
  const [rows] = await pool.execute('SELECT * FROM solicitacoes_colaborador WHERE id = ? LIMIT 1', [
    id,
  ]);
  return mapSolicitacao(rows[0]);
}

async function listSolicitacoesBySolicitante(usuarioId) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT * FROM solicitacoes_colaborador
     WHERE solicitante_usuario_id = ?
     ORDER BY criado_em DESC`,
    [usuarioId]
  );
  return rows.map(mapSolicitacao);
}

async function listSolicitacoesAdmin(filtros = {}) {
  const pool = getPool();
  const where = [];
  const params = [];

  if (filtros.tipo) {
    where.push('tipo = ?');
    params.push(filtros.tipo);
  }
  if (filtros.status) {
    where.push('status = ?');
    params.push(filtros.status);
  }
  if (filtros.de) {
    where.push('DATE(criado_em) >= ?');
    params.push(filtros.de);
  }
  if (filtros.ate) {
    where.push('DATE(criado_em) <= ?');
    params.push(filtros.ate);
  }

  const sql = `SELECT * FROM solicitacoes_colaborador
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY criado_em DESC
    LIMIT 500`;
  const [rows] = await pool.execute(sql, params);
  return rows.map(mapSolicitacao);
}

async function updateSolicitacaoStatus(id, status) {
  const pool = getPool();
  await pool.execute('UPDATE solicitacoes_colaborador SET status = ? WHERE id = ?', [status, id]);
  return findSolicitacaoById(id);
}

async function listGruposAtivos() {
  const pool = getPool();
  const [rows] = await pool.execute(
    'SELECT * FROM solicitacao_grupos WHERE ativo = 1 ORDER BY ordem ASC, id ASC'
  );
  return rows.map(mapGrupo);
}

async function listGruposAdmin() {
  const pool = getPool();
  const [rows] = await pool.execute(
    'SELECT * FROM solicitacao_grupos ORDER BY ordem ASC, id ASC'
  );
  return rows.map(mapGrupo);
}

async function findGrupoById(id) {
  const pool = getPool();
  const [rows] = await pool.execute('SELECT * FROM solicitacao_grupos WHERE id = ? LIMIT 1', [id]);
  return mapGrupo(rows[0]);
}

async function createGrupo(data) {
  const pool = getPool();
  const [result] = await pool.execute(
    `INSERT INTO solicitacao_grupos (nome, destinatarios, campos, assunto, ativo, ordem)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      data.nome,
      JSON.stringify(data.destinatarios),
      JSON.stringify(data.campos),
      data.assunto ?? null,
      data.ativo ? 1 : 0,
      data.ordem ?? 0,
    ]
  );
  return findGrupoById(result.insertId);
}

async function updateGrupo(id, data) {
  const pool = getPool();
  await pool.execute(
    `UPDATE solicitacao_grupos
     SET nome = ?, destinatarios = ?, campos = ?, assunto = ?, ativo = ?, ordem = ?
     WHERE id = ?`,
    [
      data.nome,
      JSON.stringify(data.destinatarios),
      JSON.stringify(data.campos),
      data.assunto ?? null,
      data.ativo ? 1 : 0,
      data.ordem ?? 0,
      id,
    ]
  );
  return findGrupoById(id);
}

async function deleteGrupo(id) {
  const pool = getPool();
  const [result] = await pool.execute('DELETE FROM solicitacao_grupos WHERE id = ?', [id]);
  return result.affectedRows > 0;
}

async function listEmailsIndividuaisAtivos() {
  const pool = getPool();
  const [rows] = await pool.execute(
    'SELECT * FROM solicitacao_emails_individuais WHERE ativo = 1 ORDER BY ordem ASC, id ASC'
  );
  return rows.map(mapEmailIndividual);
}

async function listEmailsIndividuaisAdmin() {
  const pool = getPool();
  const [rows] = await pool.execute(
    'SELECT * FROM solicitacao_emails_individuais ORDER BY ordem ASC, id ASC'
  );
  return rows.map(mapEmailIndividual);
}

async function findEmailIndividualById(id) {
  const pool = getPool();
  const [rows] = await pool.execute(
    'SELECT * FROM solicitacao_emails_individuais WHERE id = ? LIMIT 1',
    [id]
  );
  return mapEmailIndividual(rows[0]);
}

async function createEmailIndividual(data) {
  const pool = getPool();
  const [result] = await pool.execute(
    `INSERT INTO solicitacao_emails_individuais (nome, email, assunto, campos, ativo, ordem)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      data.nome ?? null,
      data.email,
      data.assunto ?? null,
      JSON.stringify(data.campos),
      data.ativo ? 1 : 0,
      data.ordem ?? 0,
    ]
  );
  return findEmailIndividualById(result.insertId);
}

async function updateEmailIndividual(id, data) {
  const pool = getPool();
  await pool.execute(
    `UPDATE solicitacao_emails_individuais
     SET nome = ?, email = ?, assunto = ?, campos = ?, ativo = ?, ordem = ?
     WHERE id = ?`,
    [
      data.nome ?? null,
      data.email,
      data.assunto ?? null,
      JSON.stringify(data.campos),
      data.ativo ? 1 : 0,
      data.ordem ?? 0,
      id,
    ]
  );
  return findEmailIndividualById(id);
}

async function deleteEmailIndividual(id) {
  const pool = getPool();
  const [result] = await pool.execute('DELETE FROM solicitacao_emails_individuais WHERE id = ?', [
    id,
  ]);
  return result.affectedRows > 0;
}

async function createEnvio(data) {
  const pool = getPool();
  const [result] = await pool.execute(
    `INSERT INTO solicitacao_envios
      (solicitacao_id, grupo_id, email_individual_id, grupo_nome, destinatarios, status, erro, message_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.solicitacao_id,
      data.grupo_id ?? null,
      data.email_individual_id ?? null,
      data.grupo_nome ?? null,
      JSON.stringify(data.destinatarios ?? []),
      data.status ?? 'erro',
      data.erro ?? null,
      data.message_id ?? null,
    ]
  );
  const [rows] = await pool.execute('SELECT * FROM solicitacao_envios WHERE id = ? LIMIT 1', [
    result.insertId,
  ]);
  return mapEnvio(rows[0]);
}

async function listEnviosBySolicitacao(solicitacaoId) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT * FROM solicitacao_envios WHERE solicitacao_id = ? ORDER BY enviado_em DESC`,
    [solicitacaoId]
  );
  return rows.map(mapEnvio);
}

async function isVisualizador(usuarioId) {
  const pool = getPool();
  const [rows] = await pool.execute(
    'SELECT 1 FROM solicitacao_visualizadores WHERE usuario_id = ? LIMIT 1',
    [usuarioId]
  );
  return rows.length > 0;
}

async function listVisualizadores() {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT sv.usuario_id, sv.criado_em, u.nome_completo, u.email, u.departamento
     FROM solicitacao_visualizadores sv
     JOIN usuarios u ON u.id = sv.usuario_id
     ORDER BY u.nome_completo ASC`
  );
  return rows.map(mapVisualizador);
}

async function addVisualizador(usuarioId, criadoPor = null) {
  const pool = getPool();
  await pool.execute(
    'INSERT IGNORE INTO solicitacao_visualizadores (usuario_id, criado_por) VALUES (?, ?)',
    [usuarioId, criadoPor]
  );
  const [rows] = await pool.execute(
    `SELECT sv.usuario_id, sv.criado_em, u.nome_completo, u.email, u.departamento
     FROM solicitacao_visualizadores sv
     JOIN usuarios u ON u.id = sv.usuario_id
     WHERE sv.usuario_id = ? LIMIT 1`,
    [usuarioId]
  );
  return mapVisualizador(rows[0]);
}

async function removeVisualizador(usuarioId) {
  const pool = getPool();
  const [result] = await pool.execute(
    'DELETE FROM solicitacao_visualizadores WHERE usuario_id = ?',
    [usuarioId]
  );
  return result.affectedRows > 0;
}

module.exports = {
  mapSolicitacao,
  createSolicitacao,
  findSolicitacaoById,
  listSolicitacoesBySolicitante,
  listSolicitacoesAdmin,
  updateSolicitacaoStatus,
  listGruposAtivos,
  listGruposAdmin,
  findGrupoById,
  createGrupo,
  updateGrupo,
  deleteGrupo,
  listEmailsIndividuaisAtivos,
  listEmailsIndividuaisAdmin,
  findEmailIndividualById,
  createEmailIndividual,
  updateEmailIndividual,
  deleteEmailIndividual,
  createEnvio,
  listEnviosBySolicitacao,
  isVisualizador,
  listVisualizadores,
  addVisualizador,
  removeVisualizador,
  decodeBlobRef,
};
