const { getPool } = require('../db/pool');

const MESES = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];

const SELECT_BASE = `
  SELECT c.*,
         cat.nome AS cat_nome,
         cat.slug AS cat_slug,
         cat.cor AS cat_cor
  FROM comunicados c
  INNER JOIN comunicado_categorias cat ON cat.id = c.categoria_id
`;

function formatDataPublicacao(value) {
  let raw;
  if (value instanceof Date) {
    const year = value.getUTCFullYear();
    const month = String(value.getUTCMonth() + 1).padStart(2, '0');
    const day = String(value.getUTCDate()).padStart(2, '0');
    raw = `${year}-${month}-${day}`;
  } else {
    raw = String(value).slice(0, 10);
  }
  const [year, month, day] = raw.split('-').map(Number);
  if (!year || !month || !day) {
    return { dia: '', mes: '', dataPublicacao: raw };
  }
  return {
    dia: String(day).padStart(2, '0'),
    mes: MESES[month - 1] || '',
    dataPublicacao: raw,
  };
}

function mapComunicado(row) {
  if (!row) return null;
  const dataFmt = formatDataPublicacao(row.data_publicacao);
  return {
    id: row.id,
    titulo: row.titulo,
    categoriaId: row.categoria_id,
    categoriaLabel: row.cat_nome,
    catClasse: row.cat_slug,
    categoriaCor: row.cat_cor,
    dia: dataFmt.dia,
    mes: dataFmt.mes,
    dataPublicacao: dataFmt.dataPublicacao,
    ordem: row.ordem,
    ativo: Boolean(row.ativo),
    criado_por: row.criado_por,
    criado_em: row.criado_em,
    atualizado_em: row.atualizado_em,
    linkPath: row.link_path || null,
    origem: row.origem || null,
    origemId: row.origem_id != null ? Number(row.origem_id) : null,
  };
}

function nowSaoPauloSql() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const g = (t) => parts.find((p) => p.type === t)?.value;
  return `${g('year')}-${g('month')}-${g('day')} ${g('hour')}:${g('minute')}:${g('second')}`;
}

async function listarPublicos(limite = 20) {
  const pool = getPool();
  const limitNum = Math.min(Math.max(Number(limite) || 20, 1), 100);
  const agora = nowSaoPauloSql();
  const [rows] = await pool.execute(
    `${SELECT_BASE}
     LEFT JOIN pesquisas_formularios pf
       ON c.origem = 'pesquisas_formulario' AND c.origem_id = pf.id
     WHERE cat.ativo = 1
       AND (
         (
           (c.origem IS NULL OR c.origem <> 'pesquisas_formulario')
           AND c.ativo = 1
         )
         OR (
           c.origem = 'pesquisas_formulario'
           AND pf.id IS NOT NULL
           AND pf.status = 'publicado'
           AND (pf.evento_ativo IS NULL OR pf.evento_ativo = 1)
           AND (pf.publico_alvo IS NULL OR pf.publico_alvo <> 'externos')
           AND (pf.prazo_inicio IS NULL OR pf.prazo_inicio <= ?)
           AND (pf.prazo_fim IS NULL OR pf.prazo_fim >= ?)
         )
       )
     ORDER BY c.data_publicacao DESC, c.ordem IS NULL, c.ordem ASC, c.id DESC
     LIMIT ${limitNum}`,
    [agora, agora]
  );
  return rows.map(mapComunicado);
}

async function listarAdmin({ busca } = {}) {
  const pool = getPool();
  const conditions = [];
  const params = [];

  if (busca?.trim()) {
    conditions.push('(c.titulo LIKE ? OR cat.nome LIKE ?)');
    const term = `%${busca.trim()}%`;
    params.push(term, term);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const [rows] = await pool.execute(
    `${SELECT_BASE}
     ${where}
     ORDER BY c.data_publicacao DESC, c.ordem IS NULL, c.ordem ASC, c.id DESC`,
    params
  );
  return rows.map(mapComunicado);
}

async function buscarPorId(id) {
  const pool = getPool();
  const [rows] = await pool.execute(`${SELECT_BASE} WHERE c.id = ? LIMIT 1`, [id]);
  return mapComunicado(rows[0]);
}

async function criar(data) {
  const pool = getPool();
  const [result] = await pool.execute(
    `INSERT INTO comunicados
       (titulo, categoria_id, data_publicacao, ordem, ativo, criado_por, link_path, origem, origem_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.titulo,
      data.categoria_id,
      data.data_publicacao,
      data.ordem ?? null,
      data.ativo ? 1 : 0,
      data.criado_por ?? null,
      data.link_path ?? null,
      data.origem ?? null,
      data.origem_id ?? null,
    ]
  );
  return buscarPorId(result.insertId);
}

async function atualizar(id, data) {
  const pool = getPool();
  await pool.execute(
    `UPDATE comunicados
     SET titulo = ?, categoria_id = ?, data_publicacao = ?, ordem = ?, ativo = ?
     WHERE id = ?`,
    [
      data.titulo,
      data.categoria_id,
      data.data_publicacao,
      data.ordem ?? null,
      data.ativo ? 1 : 0,
      id,
    ]
  );
  return buscarPorId(id);
}

async function buscarPorOrigem(origem, origemId) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `${SELECT_BASE} WHERE c.origem = ? AND c.origem_id = ? LIMIT 1`,
    [origem, origemId]
  );
  return mapComunicado(rows[0]);
}

async function upsertOrigem(data) {
  const existing = await buscarPorOrigem(data.origem, data.origem_id);
  if (existing) {
    const pool = getPool();
    await pool.execute(
      `UPDATE comunicados
       SET titulo = ?, categoria_id = ?, ativo = ?, link_path = ?, origem = ?, origem_id = ?
       WHERE id = ?`,
      [
        data.titulo,
        data.categoria_id,
        data.ativo ? 1 : 0,
        data.link_path ?? null,
        data.origem,
        data.origem_id,
        existing.id,
      ]
    );
    return buscarPorId(existing.id);
  }
  return criar(data);
}

async function setAtivo(id, ativo) {
  const pool = getPool();
  await pool.execute('UPDATE comunicados SET ativo = ? WHERE id = ?', [ativo ? 1 : 0, id]);
  return buscarPorId(id);
}

async function remover(id) {
  const pool = getPool();
  await pool.execute('DELETE FROM comunicados WHERE id = ?', [id]);
}

module.exports = {
  listarPublicos,
  listarAdmin,
  buscarPorId,
  buscarPorOrigem,
  upsertOrigem,
  setAtivo,
  criar,
  atualizar,
  remover,
};
