const { getPool } = require('../db/pool');
const { normalizeShareUrl } = require('../services/graph.service');

function mapSolicitacao(row) {
  if (!row) return null;
  return {
    id: row.id,
    n_requisicao: row.n_requisicao,
    requisitante: row.requisitante || null,
    usuario: row.usuario,
    status_geral: row.status_geral || null,
    tipo_documento:
      row.tipo_documento != null && String(row.tipo_documento).trim() !== ''
        ? String(row.tipo_documento).trim()
        : null,
    pedido_contrato:
      row.pedido_contrato != null && String(row.pedido_contrato).trim() !== ''
        ? String(row.pedido_contrato).trim()
        : null,
    fornecedor: row.fornecedor || null,
    valor_total_pedido: row.valor_total_pedido != null ? Number(row.valor_total_pedido) : null,
    saldo_pedido: row.saldo_pedido != null ? Number(row.saldo_pedido) : null,
    data_emissao_pedido: row.data_emissao_pedido || null,
    data_aprovacao_rm: row.data_aprovacao_rm || null,
    mapa_cotacao: row.mapa_cotacao || null,
    numero_approvo: row.numero_approvo || null,
    centro_custo: row.centro_custo || null,
    nome_filial: row.nome_filial || null,
    cod_filial: row.cod_filial != null && String(row.cod_filial).trim() !== '' ? String(row.cod_filial).trim() : null,
    sincronizado_em: row.sincronizado_em || null,
  };
}

function mapConfig(row) {
  if (!row) {
    return {
      id: 1,
      sharepoint_url: null,
      hostname: null,
      site_path: null,
      biblioteca: null,
      arquivo_caminho: null,
      item_id: null,
      aba_rm: 'Requisição',
      aba_matriz: 'TblMatrizMensagens',
      sync_automatica: false,
      sync_intervalo_min: 60,
      ultima_sync: null,
      ultima_sync_status: null,
      ultima_sync_linhas: null,
      ultima_sync_erro: null,
      atualizado_em: null,
    };
  }
  return {
    id: row.id,
    sharepoint_url: row.sharepoint_url || null,
    hostname: row.hostname || null,
    site_path: row.site_path || null,
    biblioteca: row.biblioteca || null,
    arquivo_caminho: row.arquivo_caminho || null,
    item_id: row.item_id || null,
    aba_rm: row.aba_rm || 'Requisição',
    aba_matriz: row.aba_matriz || 'TblMatrizMensagens',
    sync_automatica: !!row.sync_automatica,
    sync_intervalo_min: Number(row.sync_intervalo_min) || 60,
    ultima_sync: row.ultima_sync || null,
    ultima_sync_status: row.ultima_sync_status || null,
    ultima_sync_linhas: row.ultima_sync_linhas != null ? Number(row.ultima_sync_linhas) : null,
    ultima_sync_erro: row.ultima_sync_erro || null,
    atualizado_em: row.atualizado_em || null,
  };
}

function mapSyncLog(row) {
  if (!row) return null;
  return {
    id: row.id,
    iniciado_em: row.iniciado_em,
    finalizado_em: row.finalizado_em || null,
    status: row.status,
    linhas_importadas: Number(row.linhas_importadas) || 0,
    mensagem_erro: row.mensagem_erro || null,
  };
}

async function getConfig() {
  const pool = getPool();
  const [rows] = await pool.execute('SELECT * FROM followup_config WHERE id = 1 LIMIT 1');
  return mapConfig(rows[0]);
}

async function updateConfig(data) {
  const pool = getPool();
  const sets = [];
  const params = [];

  const fields = [
    'sharepoint_url',
    'hostname',
    'site_path',
    'biblioteca',
    'arquivo_caminho',
    'item_id',
    'aba_rm',
    'aba_matriz',
  ];
  for (const f of fields) {
    if (data[f] !== undefined) {
      sets.push(`${f} = ?`);
      const v = data[f];
      if (f === 'sharepoint_url') {
        params.push(v == null || String(v).trim() === '' ? null : normalizeShareUrl(v));
      } else {
        params.push(v == null || String(v).trim() === '' ? null : String(v).trim());
      }
    }
  }
  if (data.sync_automatica !== undefined) {
    sets.push('sync_automatica = ?');
    params.push(data.sync_automatica ? 1 : 0);
  }
  if (data.sync_intervalo_min !== undefined) {
    sets.push('sync_intervalo_min = ?');
    const n = Number(data.sync_intervalo_min);
    params.push(Number.isFinite(n) && n >= 5 ? Math.trunc(n) : 60);
  }

  if (!sets.length) return getConfig();

  await pool.execute(`UPDATE followup_config SET ${sets.join(', ')} WHERE id = 1`, params);
  return getConfig();
}

async function touchUltimaSync({ status, linhas, erro }) {
  const pool = getPool();
  await pool.execute(
    `UPDATE followup_config SET
      ultima_sync = CURRENT_TIMESTAMP,
      ultima_sync_status = ?,
      ultima_sync_linhas = ?,
      ultima_sync_erro = ?
     WHERE id = 1`,
    [status || null, linhas != null ? Number(linhas) : null, erro || null]
  );
}

async function listByUsuario(usuario) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT * FROM followup_solicitacoes
     WHERE usuario = ?
     ORDER BY n_requisicao DESC`,
    [usuario]
  );
  return rows.map(mapSolicitacao);
}

async function resumoByUsuario(usuario) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT status_geral AS status, COUNT(*) AS qtd
     FROM followup_solicitacoes
     WHERE usuario = ?
     GROUP BY status_geral
     ORDER BY qtd DESC, status_geral ASC`,
    [usuario]
  );
  return rows.map((r) => ({
    status: r.status || '—',
    qtd: Number(r.qtd) || 0,
  }));
}

async function findByNumero(nRequisicao, escopo = 'todos') {
  const pool = getPool();
  const n = Math.trunc(Number(nRequisicao));
  const esc = String(escopo || 'todos').toLowerCase();

  if (esc === 'rm') {
    const [rows] = await pool.execute(
      `SELECT * FROM followup_solicitacoes
       WHERE n_requisicao = ?
       ORDER BY
         CASE WHEN tipo_documento IS NULL OR TRIM(tipo_documento) = '' THEN 0 ELSE 1 END,
         tipo_documento ASC,
         cod_filial ASC,
         id ASC`,
      [n]
    );
    return rows.map(mapSolicitacao);
  }

  if (esc === 'documento') {
    const [rows] = await pool.execute(
      `SELECT * FROM followup_solicitacoes
       WHERE pedido_contrato = ?
         AND tipo_documento IS NOT NULL
         AND TRIM(tipo_documento) <> ''
       ORDER BY tipo_documento ASC, cod_filial ASC, id ASC`,
      [String(n)]
    );
    return rows.map(mapSolicitacao);
  }

  const [rows] = await pool.execute(
    `SELECT * FROM followup_solicitacoes
     WHERE n_requisicao = ?
        OR pedido_contrato = ?
     ORDER BY
       CASE WHEN n_requisicao = ? THEN 0 ELSE 1 END,
       tipo_documento ASC,
       cod_filial ASC,
       id ASC`,
    [n, String(n), n]
  );
  return rows.map(mapSolicitacao);
}

async function listFiliaisByUsuario(usuario) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT cod_filial AS codigo,
            MAX(NULLIF(TRIM(nome_filial), '')) AS nome
     FROM followup_solicitacoes
     WHERE usuario = ?
       AND cod_filial IS NOT NULL
       AND TRIM(cod_filial) <> ''
     GROUP BY cod_filial
     ORDER BY CAST(cod_filial AS UNSIGNED), cod_filial ASC`,
    [usuario]
  );
  return rows.map((r) => ({
    codigo: String(r.codigo),
    nome: r.nome || null,
  }));
}

async function getMatrizMap() {
  const pool = getPool();
  const [rows] = await pool.execute('SELECT status_geral, mensagem_template FROM followup_matriz');
  const map = new Map();
  for (const r of rows) {
    map.set(r.status_geral, r.mensagem_template);
  }
  return map;
}

async function replaceSolicitacoes(solicitacoes) {
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute('DELETE FROM followup_solicitacoes');

    if (solicitacoes.length) {
      const cols = 16;
      const maxRowsPerBatch = Math.floor(60000 / cols);
      for (let offset = 0; offset < solicitacoes.length; offset += maxRowsPerBatch) {
        const batch = solicitacoes.slice(offset, offset + maxRowsPerBatch);
        const placeholders = batch.map(() => '(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').join(',');
        const params = [];
        for (const s of batch) {
          params.push(
            s.n_requisicao,
            s.requisitante,
            s.usuario,
            s.status_geral,
            s.tipo_documento || '',
            s.pedido_contrato || '',
            s.fornecedor,
            s.valor_total_pedido,
            s.saldo_pedido,
            s.data_emissao_pedido,
            s.data_aprovacao_rm,
            s.mapa_cotacao,
            s.numero_approvo,
            s.centro_custo,
            s.nome_filial,
            s.cod_filial != null && String(s.cod_filial).trim() !== '' ? String(s.cod_filial).trim() : ''
          );
        }
        await conn.execute(
          `INSERT INTO followup_solicitacoes (
            n_requisicao, requisitante, usuario, status_geral, tipo_documento,
            pedido_contrato, fornecedor, valor_total_pedido, saldo_pedido,
            data_emissao_pedido, data_aprovacao_rm, mapa_cotacao, numero_approvo,
            centro_custo, nome_filial, cod_filial
          ) VALUES ${placeholders}`,
          params
        );
      }
    }

    await conn.commit();
    return solicitacoes.length;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function upsertMatriz(itens) {
  if (!itens?.length) return 0;
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const item of itens) {
      await conn.execute(
        `INSERT INTO followup_matriz (status_geral, mensagem_template, colunas_lidas)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE
           mensagem_template = VALUES(mensagem_template),
           colunas_lidas = VALUES(colunas_lidas)`,
        [item.status_geral, item.mensagem_template, item.colunas_lidas || null]
      );
    }
    await conn.commit();
    return itens.length;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function insertSyncLog({ status, linhas_importadas, mensagem_erro, iniciado_em }) {
  const pool = getPool();
  const [result] = await pool.execute(
    `INSERT INTO followup_sync_log (iniciado_em, finalizado_em, status, linhas_importadas, mensagem_erro)
     VALUES (?, CURRENT_TIMESTAMP, ?, ?, ?)`,
    [iniciado_em || new Date(), status, linhas_importadas || 0, mensagem_erro || null]
  );
  return result.insertId;
}

async function getUltimoSyncLog() {
  const pool = getPool();
  const [rows] = await pool.execute(
    'SELECT * FROM followup_sync_log ORDER BY id DESC LIMIT 1'
  );
  return mapSyncLog(rows[0]);
}

module.exports = {
  mapSolicitacao,
  mapConfig,
  getConfig,
  updateConfig,
  touchUltimaSync,
  listByUsuario,
  resumoByUsuario,
  findByNumero,
  listFiliaisByUsuario,
  getMatrizMap,
  replaceSolicitacoes,
  upsertMatriz,
  insertSyncLog,
  getUltimoSyncLog,
};
