const { getPool } = require('../db/pool');
const { parseAntecedencias, parseEmailsRh, toIsoDate } = require('../utils/nsc-status.util');

function mapConfig(row) {
  if (!row) return null;
  return {
    meses_validade_padrao: Number(row.meses_validade_padrao) || 12,
    antecedencias_aviso: parseAntecedencias(row.antecedencias_aviso),
    notificar_colaborador: !!row.notificar_colaborador,
    notificar_gestor: !!row.notificar_gestor,
    resumo_semanal_rh: !!row.resumo_semanal_rh,
    sinalizar_operacao: !!row.sinalizar_operacao,
    permitir_validade_manual: !!row.permitir_validade_manual,
    emails_rh: parseEmailsRh(row.emails_rh),
  };
}

function mapCertificacao(row) {
  if (!row) return null;
  return {
    id: row.id,
    ad_object_id: row.ad_object_id,
    sam_account_name: row.sam_account_name,
    obrigatorio_override:
      row.obrigatorio_override == null ? null : Number(row.obrigatorio_override),
    arquivo_id: row.arquivo_id ?? null,
    data_emissao: toIsoDate(row.data_emissao),
    validade_manual: toIsoDate(row.validade_manual),
    atualizado_em: row.atualizado_em || null,
  };
}

function mapEnvio(row) {
  if (!row) return null;
  return {
    id: row.id,
    ad_object_id: row.ad_object_id,
    nome_arquivo: row.nome_arquivo,
    caminho_storage: row.caminho_storage,
    mime: row.mime,
    tamanho: Number(row.tamanho) || 0,
    data_emissao: toIsoDate(row.data_emissao),
    validade: toIsoDate(row.validade),
    nome_lido: row.nome_lido || null,
    enviado_em: row.enviado_em || null,
    vigente: !!row.vigente,
    aprovacao: row.aprovacao || 'aprovado',
    motivo_rejeicao: row.motivo_rejeicao || null,
    motivo_aprovacao: row.motivo_aprovacao || null,
    aprovado_por: row.aprovado_por || null,
    aprovado_em: row.aprovado_em || null,
  };
}

function mapRegra(row) {
  if (!row) return null;
  return {
    id: row.id,
    departamento_ou: row.departamento_ou,
    obrigatorio: !!row.obrigatorio,
  };
}

async function getConfig() {
  const pool = getPool();
  const [rows] = await pool.execute('SELECT * FROM nsc_config WHERE id = 1 LIMIT 1');
  if (!rows[0]) {
    await pool.execute(
      `INSERT IGNORE INTO nsc_config (
         id, meses_validade_padrao, antecedencias_aviso,
         notificar_colaborador, notificar_gestor, resumo_semanal_rh, sinalizar_operacao,
         permitir_validade_manual, emails_rh
       ) VALUES (1, 12, '[30,15,7]', 1, 1, 0, 1, 0, '[]')`
    );
    const [again] = await pool.execute('SELECT * FROM nsc_config WHERE id = 1 LIMIT 1');
    return mapConfig(again[0]);
  }
  return mapConfig(rows[0]);
}

async function saveConfig(data) {
  const pool = getPool();
  await pool.execute(
    `UPDATE nsc_config SET
       meses_validade_padrao = ?,
       antecedencias_aviso = ?,
       notificar_colaborador = ?,
       notificar_gestor = ?,
       resumo_semanal_rh = ?,
       sinalizar_operacao = ?,
       permitir_validade_manual = ?,
       emails_rh = ?
     WHERE id = 1`,
    [
      data.meses_validade_padrao,
      JSON.stringify(data.antecedencias_aviso),
      data.notificar_colaborador ? 1 : 0,
      data.notificar_gestor ? 1 : 0,
      data.resumo_semanal_rh ? 1 : 0,
      data.sinalizar_operacao ? 1 : 0,
      data.permitir_validade_manual ? 1 : 0,
      JSON.stringify(data.emails_rh || []),
    ]
  );
  return getConfig();
}

async function findCertificacaoByAdId(adObjectId) {
  const pool = getPool();
  const [rows] = await pool.execute(
    'SELECT * FROM nsc_certificacao WHERE ad_object_id = ? LIMIT 1',
    [adObjectId]
  );
  return mapCertificacao(rows[0]);
}

async function upsertCertificacao(adObjectId, fields) {
  const pool = getPool();
  const existing = await findCertificacaoByAdId(adObjectId);
  if (!existing) {
    await pool.execute(
      `INSERT INTO nsc_certificacao (
         ad_object_id, sam_account_name, obrigatorio_override,
         arquivo_id, data_emissao, validade_manual
       ) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        adObjectId,
        fields.sam_account_name ?? null,
        fields.obrigatorio_override === undefined ? null : fields.obrigatorio_override,
        fields.arquivo_id ?? null,
        fields.data_emissao ?? null,
        fields.validade_manual ?? null,
      ]
    );
    return findCertificacaoByAdId(adObjectId);
  }

  const next = {
    sam_account_name:
      fields.sam_account_name !== undefined
        ? fields.sam_account_name
        : existing.sam_account_name,
    obrigatorio_override:
      fields.obrigatorio_override !== undefined
        ? fields.obrigatorio_override
        : existing.obrigatorio_override,
    arquivo_id: fields.arquivo_id !== undefined ? fields.arquivo_id : existing.arquivo_id,
    data_emissao:
      fields.data_emissao !== undefined ? fields.data_emissao : existing.data_emissao,
    validade_manual:
      fields.validade_manual !== undefined ? fields.validade_manual : existing.validade_manual,
  };

  await pool.execute(
    `UPDATE nsc_certificacao SET
       sam_account_name = ?,
       obrigatorio_override = ?,
       arquivo_id = ?,
       data_emissao = ?,
       validade_manual = ?
     WHERE ad_object_id = ?`,
    [
      next.sam_account_name,
      next.obrigatorio_override,
      next.arquivo_id,
      next.data_emissao,
      next.validade_manual,
      adObjectId,
    ]
  );
  return findCertificacaoByAdId(adObjectId);
}

async function findRegraByDepartamento(departamento) {
  if (!departamento) return null;
  const pool = getPool();
  const [rows] = await pool.execute(
    'SELECT * FROM nsc_regra_departamento WHERE departamento_ou = ? LIMIT 1',
    [departamento]
  );
  return mapRegra(rows[0]);
}

async function listRegras() {
  const pool = getPool();
  const [rows] = await pool.execute(
    'SELECT * FROM nsc_regra_departamento ORDER BY departamento_ou ASC'
  );
  return rows.map(mapRegra);
}

function mapGestor(row) {
  return {
    ad_object_id: row.ad_object_id,
    departamento_ou: row.departamento_ou,
    nome: row.nome || null,
    email: row.email || null,
    cargo: row.cargo || null,
  };
}

async function listGestores() {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT g.departamento_ou, g.ad_object_id, c.nome, c.email, c.cargo
     FROM nsc_departamento_gestor g
     LEFT JOIN colaboradores c ON c.ad_id = g.ad_object_id
     ORDER BY COALESCE(c.nome, g.ad_object_id) ASC`
  );
  return rows.map(mapGestor);
}

async function listDepartamentosDoGestor(adObjectId) {
  if (!adObjectId) return [];
  const pool = getPool();
  const [rows] = await pool.execute(
    'SELECT departamento_ou FROM nsc_departamento_gestor WHERE ad_object_id = ? ORDER BY departamento_ou ASC',
    [adObjectId]
  );
  return rows.map((r) => String(r.departamento_ou || '').trim()).filter(Boolean);
}

async function listGestoresPorDepartamento(departamentoOu) {
  if (!departamentoOu) return [];
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT g.departamento_ou, g.ad_object_id, c.nome, c.email, c.cargo
     FROM nsc_departamento_gestor g
     LEFT JOIN colaboradores c ON c.ad_id = g.ad_object_id
     WHERE g.departamento_ou = ?
     ORDER BY COALESCE(c.nome, g.ad_object_id) ASC`,
    [departamentoOu]
  );
  return rows.map(mapGestor);
}

async function substituirGestores(departamentoOu, adObjectIds) {
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute('DELETE FROM nsc_departamento_gestor WHERE departamento_ou = ?', [
      departamentoOu,
    ]);
    for (const adObjectId of adObjectIds) {
      await conn.execute(
        `INSERT INTO nsc_departamento_gestor (departamento_ou, ad_object_id)
         VALUES (?, ?)`,
        [departamentoOu, adObjectId]
      );
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function upsertRegra(departamentoOu, obrigatorio) {
  const pool = getPool();
  await pool.execute(
    `INSERT INTO nsc_regra_departamento (departamento_ou, obrigatorio)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE obrigatorio = VALUES(obrigatorio)`,
    [departamentoOu, obrigatorio ? 1 : 0]
  );
  return findRegraByDepartamento(departamentoOu);
}

async function limparOverrideNegativoPorDepartamento(departamentoOu) {
  const nome = String(departamentoOu || '').trim();
  if (!nome) return 0;
  const pool = getPool();
  const [result] = await pool.execute(
    `UPDATE nsc_certificacao cert
     INNER JOIN colaboradores c ON c.ad_id = cert.ad_object_id
     SET cert.obrigatorio_override = NULL
     WHERE c.departamento = ?
       AND cert.obrigatorio_override = 0`,
    [nome]
  );
  return result.affectedRows || 0;
}

async function listJoinColaboradores({ busca, departamento, empresa } = {}) {
  const pool = getPool();
  const conditions = ['c.ativo = 1'];
  const values = [];

  if (departamento) {
    conditions.push('c.departamento = ?');
    values.push(departamento);
  }
  if (empresa === 'Sem empresa') {
    conditions.push("(c.empresa IS NULL OR TRIM(c.empresa) = '')");
  } else if (empresa) {
    conditions.push('c.empresa = ?');
    values.push(empresa);
  }
  if (busca) {
    const like = `%${busca}%`;
    conditions.push(
      '(c.nome LIKE ? OR c.email LIKE ? OR c.cargo LIKE ? OR c.departamento LIKE ? OR c.empresa LIKE ?)'
    );
    values.push(like, like, like, like, like);
  }

  const where = `WHERE ${conditions.join(' AND ')}`;
  const [rows] = await pool.execute(
    `SELECT c.ad_id, c.nome, c.cargo, c.departamento, c.empresa, c.email, c.tenant_id, c.sincronizado_em,
            cert.id AS cert_id, cert.sam_account_name, cert.obrigatorio_override,
            cert.arquivo_id, cert.data_emissao, cert.validade_manual, cert.atualizado_em,
            r.obrigatorio AS regra_obrigatorio
     FROM colaboradores c
     LEFT JOIN nsc_certificacao cert ON cert.ad_object_id = c.ad_id
     LEFT JOIN nsc_regra_departamento r ON r.departamento_ou = c.departamento
     ${where}
     ORDER BY c.nome ASC`,
    values
  );

  return rows.map((row) => ({
    colaborador: {
      ad_id: row.ad_id,
      nome: row.nome,
      cargo: row.cargo,
      departamento: row.departamento,
      empresa: row.empresa || null,
      email: row.email,
      tenant_id: row.tenant_id,
      sincronizado_em: row.sincronizado_em,
    },
    certificacao: row.cert_id
      ? mapCertificacao({
          id: row.cert_id,
          ad_object_id: row.ad_id,
          sam_account_name: row.sam_account_name,
          obrigatorio_override: row.obrigatorio_override,
          arquivo_id: row.arquivo_id,
          data_emissao: row.data_emissao,
          validade_manual: row.validade_manual,
          atualizado_em: row.atualizado_em,
        })
      : null,
    regra_obrigatorio: !!row.regra_obrigatorio,
  }));
}

async function findJoinByAdId(adObjectId) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT c.ad_id, c.nome, c.cargo, c.departamento, c.empresa, c.email, c.tenant_id, c.sincronizado_em,
            cert.id AS cert_id, cert.sam_account_name, cert.obrigatorio_override,
            cert.arquivo_id, cert.data_emissao, cert.validade_manual, cert.atualizado_em,
            r.obrigatorio AS regra_obrigatorio
     FROM colaboradores c
     LEFT JOIN nsc_certificacao cert ON cert.ad_object_id = c.ad_id
     LEFT JOIN nsc_regra_departamento r ON r.departamento_ou = c.departamento
     WHERE c.ad_id = ?
     LIMIT 1`,
    [adObjectId]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    colaborador: {
      ad_id: row.ad_id,
      nome: row.nome,
      cargo: row.cargo,
      departamento: row.departamento,
      empresa: row.empresa || null,
      email: row.email,
      tenant_id: row.tenant_id,
      sincronizado_em: row.sincronizado_em,
    },
    certificacao: row.cert_id
      ? mapCertificacao({
          id: row.cert_id,
          ad_object_id: row.ad_id,
          sam_account_name: row.sam_account_name,
          obrigatorio_override: row.obrigatorio_override,
          arquivo_id: row.arquivo_id,
          data_emissao: row.data_emissao,
          validade_manual: row.validade_manual,
          atualizado_em: row.atualizado_em,
        })
      : null,
    regra_obrigatorio: !!row.regra_obrigatorio,
  };
}

async function listEnvios(adObjectId) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT * FROM nsc_envio
     WHERE ad_object_id = ?
     ORDER BY enviado_em DESC, id DESC`,
    [adObjectId]
  );
  return rows.map(mapEnvio);
}

async function findEnvioById(id) {
  const pool = getPool();
  const [rows] = await pool.execute('SELECT * FROM nsc_envio WHERE id = ? LIMIT 1', [id]);
  return mapEnvio(rows[0]);
}

async function findEnvioVigente(adObjectId) {
  const pool = getPool();
  const [rows] = await pool.execute(
    'SELECT * FROM nsc_envio WHERE ad_object_id = ? AND vigente = 1 ORDER BY id DESC LIMIT 1',
    [adObjectId]
  );
  return mapEnvio(rows[0]);
}

async function criarEnvioVigente(adObjectId, data) {
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute('UPDATE nsc_envio SET vigente = 0 WHERE ad_object_id = ? AND vigente = 1', [
      adObjectId,
    ]);
    await conn.execute(
      `UPDATE nsc_envio
          SET aprovacao = 'rejeitado',
              motivo_rejeicao = 'Substituído por novo envio'
        WHERE ad_object_id = ? AND aprovacao = 'pendente'`,
      [adObjectId]
    );
    const [result] = await conn.execute(
      `INSERT INTO nsc_envio (
         ad_object_id, nome_arquivo, caminho_storage, mime, tamanho,
         data_emissao, validade, nome_lido, vigente, aprovacao
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 'aprovado')`,
      [
        adObjectId,
        data.nome_arquivo,
        data.caminho_storage,
        data.mime,
        data.tamanho,
        data.data_emissao,
        data.validade,
        data.nome_lido || null,
      ]
    );
    await conn.commit();
    return findEnvioById(result.insertId);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function criarEnvioPendente(adObjectId, data) {
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute(
      `UPDATE nsc_envio
          SET aprovacao = 'rejeitado',
              motivo_rejeicao = 'Substituído por novo envio pendente'
        WHERE ad_object_id = ? AND aprovacao = 'pendente'`,
      [adObjectId]
    );
    const [result] = await conn.execute(
      `INSERT INTO nsc_envio (
         ad_object_id, nome_arquivo, caminho_storage, mime, tamanho,
         data_emissao, validade, nome_lido, vigente, aprovacao, motivo_aprovacao
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 'pendente', ?)`,
      [
        adObjectId,
        data.nome_arquivo,
        data.caminho_storage,
        data.mime,
        data.tamanho,
        data.data_emissao,
        data.validade,
        data.nome_lido || null,
        data.motivo_aprovacao || null,
      ]
    );
    await conn.commit();
    return findEnvioById(result.insertId);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function findEnvioPendente(adObjectId) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT * FROM nsc_envio
     WHERE ad_object_id = ? AND aprovacao = 'pendente'
     ORDER BY id DESC LIMIT 1`,
    [adObjectId]
  );
  return mapEnvio(rows[0]);
}

async function mapEnviosPendentes(adObjectIds) {
  const ids = [...new Set((adObjectIds || []).filter(Boolean))];
  const out = new Map();
  if (!ids.length) return out;
  const pool = getPool();
  const ph = ids.map(() => '?').join(', ');
  const [rows] = await pool.execute(
    `SELECT * FROM nsc_envio
     WHERE aprovacao = 'pendente' AND ad_object_id IN (${ph})
     ORDER BY id DESC`,
    ids
  );
  for (const row of rows) {
    if (!out.has(row.ad_object_id)) out.set(row.ad_object_id, mapEnvio(row));
  }
  return out;
}

function mapAprovacao(row) {
  if (!row) return null;
  return {
    ...mapEnvio(row),
    colaborador_nome: row.colaborador_nome || null,
    colaborador_email: row.colaborador_email || null,
    departamento: row.departamento || null,
    cargo: row.cargo || null,
  };
}

async function listarAprovacoes(status) {
  const st = ['pendente', 'aprovado', 'rejeitado'].includes(status) ? status : 'pendente';
  const extra = st === 'aprovado' ? ' AND e.aprovado_em IS NOT NULL' : '';
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT e.*, c.nome AS colaborador_nome, c.email AS colaborador_email,
            c.departamento, c.cargo
     FROM nsc_envio e
     LEFT JOIN colaboradores c ON c.ad_id = e.ad_object_id
     WHERE e.aprovacao = ?${extra}
     ORDER BY e.enviado_em DESC, e.id DESC
     LIMIT 300`,
    [st]
  );
  return rows.map(mapAprovacao);
}

async function contarAprovacoesPendentes() {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS n FROM nsc_envio WHERE aprovacao = 'pendente'`
  );
  return Number(rows[0]?.n) || 0;
}

async function aprovarEnvio(envioId, motivo, aprovadoPor) {
  const pool = getPool();
  const envio = await findEnvioById(envioId);
  if (!envio) return null;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute('UPDATE nsc_envio SET vigente = 0 WHERE ad_object_id = ? AND vigente = 1', [
      envio.ad_object_id,
    ]);
    await conn.execute(
      `UPDATE nsc_envio
          SET vigente = 1,
              aprovacao = 'aprovado',
              motivo_rejeicao = NULL,
              motivo_aprovacao = ?,
              aprovado_por = ?,
              aprovado_em = CURRENT_TIMESTAMP
        WHERE id = ? AND aprovacao = 'pendente'`,
      [motivo || null, aprovadoPor || null, envioId]
    );
    await conn.commit();
    return findEnvioById(envioId);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function excluirEnvio(id) {
  const pool = getPool();
  const envio = await findEnvioById(id);
  if (!envio) return null;
  await pool.execute('DELETE FROM nsc_envio WHERE id = ?', [id]);
  return envio;
}

async function rejeitarEnvio(envioId, motivo, aprovadoPor) {
  const pool = getPool();
  await pool.execute(
    `UPDATE nsc_envio
        SET aprovacao = 'rejeitado',
            motivo_rejeicao = ?,
            aprovado_por = ?,
            aprovado_em = CURRENT_TIMESTAMP
      WHERE id = ? AND aprovacao = 'pendente'`,
    [motivo || null, aprovadoPor || null, envioId]
  );
  return findEnvioById(envioId);
}

async function jaEnviouHoje(adObjectId, tipo, destinatario) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT id FROM nsc_notificacao_log
     WHERE ad_object_id = ? AND tipo = ? AND destinatario = ?
       AND DATE(enviado_em) = CURDATE()
     LIMIT 1`,
    [adObjectId, tipo, destinatario]
  );
  return !!rows[0];
}

async function jaEnviouDesde(adObjectId, tipo, destinatario, desde) {
  const pool = getPool();
  if (!desde) {
    const [rows] = await pool.execute(
      `SELECT id FROM nsc_notificacao_log
       WHERE ad_object_id = ? AND tipo = ? AND destinatario = ?
       LIMIT 1`,
      [adObjectId, tipo, destinatario]
    );
    return !!rows[0];
  }
  const [rows] = await pool.execute(
    `SELECT id FROM nsc_notificacao_log
     WHERE ad_object_id = ? AND tipo = ? AND destinatario = ?
       AND enviado_em >= ?
     LIMIT 1`,
    [adObjectId, tipo, destinatario, desde]
  );
  return !!rows[0];
}

async function registrarNotificacao({ adObjectId, tipo, destinatario, status = 'enviado' }) {
  const pool = getPool();
  await pool.execute(
    `INSERT INTO nsc_notificacao_log (ad_object_id, tipo, destinatario, status)
     VALUES (?, ?, ?, ?)`,
    [adObjectId, tipo, destinatario, status]
  );
}

function mapNotificacao(row) {
  return {
    id: row.id,
    ad_object_id: row.ad_object_id,
    tipo: row.tipo,
    destinatario: row.destinatario,
    enviado_em: row.enviado_em,
    status: row.status,
    colaborador_nome: row.colaborador_nome || null,
    departamento: row.departamento || null,
  };
}

async function listarNotificacoes({ tipo, status, busca, limite } = {}) {
  const pool = getPool();
  const conditions = [];
  const values = [];
  if (tipo === 'antecedencia') {
    conditions.push("n.tipo LIKE 'antecedencia_%'");
  } else if (tipo) {
    conditions.push('n.tipo = ?');
    values.push(tipo);
  }
  if (status) {
    conditions.push('n.status = ?');
    values.push(status);
  }
  if (busca) {
    const like = `%${busca}%`;
    conditions.push('(n.destinatario LIKE ? OR c.nome LIKE ? OR c.departamento LIKE ?)');
    values.push(like, like, like);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = Number.isInteger(limite) && limite > 0 && limite <= 1000 ? limite : 500;
  const [rows] = await pool.execute(
    `SELECT n.id, n.ad_object_id, n.tipo, n.destinatario, n.enviado_em, n.status,
            c.nome AS colaborador_nome, c.departamento
     FROM nsc_notificacao_log n
     LEFT JOIN colaboradores c ON c.ad_id = n.ad_object_id
     ${where}
     ORDER BY n.enviado_em DESC, n.id DESC
     LIMIT ${limit}`,
    values
  );
  return rows.map(mapNotificacao);
}

function parseDepartamentosJson(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((d) => String(d || '').trim()).filter(Boolean);
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((d) => String(d || '').trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function mapAcessoUsuario(row) {
  if (!row) return null;
  return {
    id: row.id,
    ad_object_id: row.ad_object_id,
    nome: row.nome || null,
    email: row.email || null,
    perfil: row.perfil === 'gestor' ? 'gestor' : 'total',
    departamentos: parseDepartamentosJson(row.departamentos_json),
    empresas: parseDepartamentosJson(row.empresas_json),
    criado_em: row.criado_em || null,
    atualizado_em: row.atualizado_em || null,
  };
}

function mapAcessoGrupo(row) {
  if (!row) return null;
  return {
    id: row.id,
    grupo_ad_id: row.grupo_ad_id,
    grupo_nome: row.grupo_nome,
    grupo_descricao: row.grupo_descricao || null,
    escopo: row.escopo || 'global',
    departamentos: parseDepartamentosJson(row.departamentos_json),
    pode_baixar: !!row.pode_baixar,
    pode_exportar: !!row.pode_exportar,
    pode_lembrar: !!row.pode_lembrar,
    pode_aprovar: !!row.pode_aprovar,
    criado_em: row.criado_em || null,
    atualizado_em: row.atualizado_em || null,
  };
}

function mapAcessoLog(row) {
  if (!row) return null;
  return {
    id: row.id,
    usuario_id: row.usuario_id ?? null,
    usuario_email: row.usuario_email || null,
    usuario_nome: row.usuario_nome || null,
    acao: row.acao,
    alvo_ad_object_id: row.alvo_ad_object_id || null,
    alvo_nome: row.alvo_nome || null,
    detalhe: row.detalhe || null,
    criado_em: row.criado_em || null,
  };
}

async function listAcessoGrupos() {
  const pool = getPool();
  const [rows] = await pool.execute(
    'SELECT * FROM nsc_acesso_grupo ORDER BY grupo_nome ASC, id ASC'
  );
  return rows.map(mapAcessoGrupo);
}

async function findAcessoGrupoById(id) {
  const pool = getPool();
  const [rows] = await pool.execute('SELECT * FROM nsc_acesso_grupo WHERE id = ? LIMIT 1', [id]);
  return mapAcessoGrupo(rows[0]);
}

async function upsertAcessoGrupo(data) {
  const pool = getPool();
  const departamentosJson = JSON.stringify(data.departamentos || []);
  if (data.id) {
    await pool.execute(
      `UPDATE nsc_acesso_grupo
       SET grupo_ad_id = ?, grupo_nome = ?, grupo_descricao = ?, escopo = ?,
           departamentos_json = ?, pode_baixar = ?, pode_exportar = ?,
           pode_lembrar = ?, pode_aprovar = ?
       WHERE id = ?`,
      [
        data.grupo_ad_id,
        data.grupo_nome,
        data.grupo_descricao || null,
        data.escopo,
        departamentosJson,
        data.pode_baixar ? 1 : 0,
        data.pode_exportar ? 1 : 0,
        data.pode_lembrar ? 1 : 0,
        data.pode_aprovar ? 1 : 0,
        data.id,
      ]
    );
    return findAcessoGrupoById(data.id);
  }
  const [result] = await pool.execute(
    `INSERT INTO nsc_acesso_grupo (
       grupo_ad_id, grupo_nome, grupo_descricao, escopo, departamentos_json,
       pode_baixar, pode_exportar, pode_lembrar, pode_aprovar
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.grupo_ad_id,
      data.grupo_nome,
      data.grupo_descricao || null,
      data.escopo,
      departamentosJson,
      data.pode_baixar ? 1 : 0,
      data.pode_exportar ? 1 : 0,
      data.pode_lembrar ? 1 : 0,
      data.pode_aprovar ? 1 : 0,
    ]
  );
  return findAcessoGrupoById(result.insertId);
}

async function deleteAcessoGrupo(id) {
  const pool = getPool();
  await pool.execute('DELETE FROM nsc_acesso_grupo WHERE id = ?', [id]);
}

async function listAcessoUsuarios() {
  const pool = getPool();
  const [rows] = await pool.execute(
    'SELECT * FROM nsc_acesso_usuario ORDER BY nome ASC, id ASC'
  );
  return rows.map(mapAcessoUsuario);
}

async function findAcessoUsuarioById(id) {
  const pool = getPool();
  const [rows] = await pool.execute('SELECT * FROM nsc_acesso_usuario WHERE id = ? LIMIT 1', [id]);
  return mapAcessoUsuario(rows[0]);
}

async function findAcessoUsuarioByAdId(adObjectId) {
  const pool = getPool();
  const [rows] = await pool.execute(
    'SELECT * FROM nsc_acesso_usuario WHERE ad_object_id = ? LIMIT 1',
    [adObjectId]
  );
  return mapAcessoUsuario(rows[0]);
}

async function upsertAcessoUsuario(data) {
  const pool = getPool();
  const departamentosJson = JSON.stringify(data.departamentos || []);
  const empresasJson = JSON.stringify(data.empresas || []);
  if (data.id) {
    await pool.execute(
      `UPDATE nsc_acesso_usuario
       SET ad_object_id = ?, nome = ?, email = ?, perfil = ?,
           departamentos_json = ?, empresas_json = ?
       WHERE id = ?`,
      [
        data.ad_object_id,
        data.nome || null,
        data.email || null,
        data.perfil,
        departamentosJson,
        empresasJson,
        data.id,
      ]
    );
    return findAcessoUsuarioById(data.id);
  }
  const existing = await findAcessoUsuarioByAdId(data.ad_object_id);
  if (existing) {
    await pool.execute(
      `UPDATE nsc_acesso_usuario
       SET nome = ?, email = ?, perfil = ?, departamentos_json = ?, empresas_json = ?
       WHERE id = ?`,
      [
        data.nome || existing.nome,
        data.email || existing.email,
        data.perfil,
        departamentosJson,
        empresasJson,
        existing.id,
      ]
    );
    return findAcessoUsuarioById(existing.id);
  }
  const [result] = await pool.execute(
    `INSERT INTO nsc_acesso_usuario (
       ad_object_id, nome, email, perfil, departamentos_json, empresas_json
     ) VALUES (?, ?, ?, ?, ?, ?)`,
    [
      data.ad_object_id,
      data.nome || null,
      data.email || null,
      data.perfil,
      departamentosJson,
      empresasJson,
    ]
  );
  return findAcessoUsuarioById(result.insertId);
}

async function deleteAcessoUsuario(id) {
  const pool = getPool();
  await pool.execute('DELETE FROM nsc_acesso_usuario WHERE id = ?', [id]);
}

async function registrarAcessoLog(data) {
  const pool = getPool();
  await pool.execute(
    `INSERT INTO nsc_acesso_log (
       usuario_id, usuario_email, usuario_nome, acao,
       alvo_ad_object_id, alvo_nome, detalhe
     ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      data.usuarioId || null,
      data.usuarioEmail || null,
      data.usuarioNome || null,
      data.acao,
      data.alvoAdObjectId || null,
      data.alvoNome || null,
      data.detalhe || null,
    ]
  );
}

async function listarAcessoLog({ limite } = {}) {
  const pool = getPool();
  const limit = Number.isInteger(limite) && limite > 0 && limite <= 500 ? limite : 80;
  const [rows] = await pool.execute(
    `SELECT * FROM nsc_acesso_log ORDER BY criado_em DESC, id DESC LIMIT ${limit}`
  );
  return rows.map(mapAcessoLog);
}

module.exports = {
  getConfig,
  saveConfig,
  findCertificacaoByAdId,
  upsertCertificacao,
  findRegraByDepartamento,
  listRegras,
  upsertRegra,
  limparOverrideNegativoPorDepartamento,
  listGestores,
  listDepartamentosDoGestor,
  listGestoresPorDepartamento,
  substituirGestores,
  listJoinColaboradores,
  findJoinByAdId,
  listEnvios,
  findEnvioById,
  findEnvioVigente,
  findEnvioPendente,
  mapEnviosPendentes,
  criarEnvioVigente,
  criarEnvioPendente,
  listarAprovacoes,
  contarAprovacoesPendentes,
  aprovarEnvio,
  rejeitarEnvio,
  excluirEnvio,
  jaEnviouHoje,
  jaEnviouDesde,
  registrarNotificacao,
  listarNotificacoes,
  listAcessoGrupos,
  findAcessoGrupoById,
  upsertAcessoGrupo,
  deleteAcessoGrupo,
  listAcessoUsuarios,
  findAcessoUsuarioById,
  findAcessoUsuarioByAdId,
  upsertAcessoUsuario,
  deleteAcessoUsuario,
  registrarAcessoLog,
  listarAcessoLog,
  mapConfig,
  mapCertificacao,
  mapEnvio,
};
