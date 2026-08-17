const XLSX = require('xlsx');

const RM_HEADER_MAP = {
  n_requisicao: ['nrequisicao', 'n requisicao', 'n° requisicao', 'nº requisicao', 'numero requisicao', 'n.requisicao'],
  requisitante: ['requisitante'],
  usuario: ['usuario', 'usuário'],
  status_geral: ['statusgeral', 'status geral'],
  pedido_contrato: ['pedidocontrato', 'pedido contrato', 'pedido/contrato'],
  fornecedor: ['fornecedor'],
  valor_total_pedido: ['valortotalpedido', 'valor total pedido', 'valor total'],
  saldo_pedido: ['saldopedido', 'saldo pedido'],
  data_emissao_pedido: [
    'datadeemissaopedido',
    'data de emissao pedido',
    'data emissao pedido',
    'data de emissão pedido',
  ],
  data_aprovacao_rm: ['dataaprovacaorm', 'data aprovacao rm', 'data de aprovacao rm'],
  mapa_cotacao: ['mapadecotacao', 'mapa de cotacao', 'mapa de cotação', 'mapa cotacao'],
  numero_approvo: ['numeroapprovo', 'numero approvo', 'número approvo'],
  centro_custo: ['centrodecusto', 'centro de custo'],
  nome_filial: [
    'nomedafilial',
    'nome da filial',
    'nome filial',
    'nomefilial',
    'filial nome',
    'desc filial',
    'descricao filial',
    'descrição filial',
  ],
  cod_filial: ['codfilial', 'cod filial', 'codigo filial', 'código filial', 'cod. filial', 'cód. filial'],
  tipo_documento: [
    'tipodocumento',
    'tipo documento',
    'tipo de documento',
    'tipodedocumento',
  ],
};

const MATRIZ_HEADER_MAP = {
  status_geral: ['statusgeral', 'status geral', 'status'],
  mensagem_template: ['mensagem', 'mensagem template', 'template', 'mensagemtemplate'],
  colunas_lidas: ['colunaslidas', 'colunas lidas', 'colunas'],
};

function normalizeHeader(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function compactHeader(value) {
  return normalizeHeader(value).replace(/\s+/g, '');
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function formatYmd(y, m, d) {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

function parseDate(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return formatYmd(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }
  if (typeof value === 'number') {
    try {
      const formatted = XLSX.SSF.format('yyyy-mm-dd', value);
      if (formatted && /^\d{4}-\d{2}-\d{2}$/.test(formatted)) return formatted;
    } catch {
      /* fallback */
    }
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return formatYmd(parsed.y, parsed.m, parsed.d);
  }
  const s = String(value).trim();
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (br) return formatYmd(Number(br[3]), Number(br[2]), Number(br[1]));
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return null;
}

function parseMoeda(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return null;
    return Math.round(value * 100) / 100;
  }
  let s = String(value)
    .replace(/\u00a0/g, ' ')
    .replace(/R\$/gi, '')
    .trim();
  if (!s || /^-+$/.test(s)) return null;
  s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  if (Number.isNaN(n)) return null;
  return Math.round(n * 100) / 100;
}

function parseTexto(value) {
  if (value == null || value === '') return null;
  const s = String(value).trim();
  return s || null;
}

function parseIntLike(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? Math.trunc(value) : null;
  const s = String(value).trim();
  if (!s) return null;
  const n = Number(s.replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function normalizeTipoDocumento(value) {
  const raw = parseTexto(value);
  if (!raw) return null;
  const u = raw.toUpperCase();
  if (u.includes('ADITIVO')) return 'ADITIVO DE CONTRATO';
  if (u.includes('CONTRATO')) return 'CONTRATO';
  if (u.includes('PEDIDO')) return 'PEDIDO';
  return raw;
}

function statusFromPedidoSheet(tipoDocumento, statusRaw) {
  const st = String(statusRaw || '')
    .trim()
    .toUpperCase();
  const tipo = normalizeTipoDocumento(tipoDocumento) || '';
  const isContrato = tipo.includes('CONTRATO') || tipo.includes('ADITIVO');
  if (st.includes('REPROV')) {
    return isContrato ? 'Aditivo/Contrato Reprovado' : 'Pedido Reprovado';
  }
  if (st.includes('APROVAÇÃO') || st.includes('APROVACAO') || st.includes('EM APROV')) {
    return isContrato ? 'Aditivo/Contrato em aprovação' : 'Pedido Aberto';
  }
  if (st.includes('APROV')) {
    return isContrato ? 'Aditivo/Contrato Aprovado' : 'Pedido Atendido';
  }
  return isContrato ? 'Aditivo/Contrato em aprovação' : 'Pedido Aberto';
}

function dedupeKeyOf(s) {
  return [
    s.n_requisicao,
    s.cod_filial || '',
    s.tipo_documento || '',
    s.pedido_contrato || '',
  ].join('|');
}

function buildColumnIndex(headers, headerMap) {
  const index = {};
  const norms = headers.map((h) => normalizeHeader(h));
  const compact = headers.map((h) => compactHeader(h));

  for (const [field, aliases] of Object.entries(headerMap)) {
    for (let i = 0; i < headers.length; i += 1) {
      const n = norms[i];
      const c = compact[i];
      if (!n && !c) continue;
      for (const alias of aliases) {
        const an = normalizeHeader(alias);
        const ac = compactHeader(alias);
        if (n === an || c === ac || c.includes(ac) || n.includes(an)) {
          if (index[field] == null) index[field] = i;
          break;
        }
      }
      if (index[field] != null) break;
    }
  }
  return index;
}

function cell(row, idx) {
  if (idx == null) return null;
  return row[idx];
}

function findSheet(workbook, sheetName) {
  const wanted = String(sheetName || '').trim().toLowerCase();
  const exact = workbook.SheetNames.find((n) => n.trim().toLowerCase() === wanted);
  if (exact) return exact;
  const partial = workbook.SheetNames.find((n) => n.trim().toLowerCase().includes(wanted));
  return partial || null;
}

function sheetToRows(workbook, sheetName) {
  const name = findSheet(workbook, sheetName);
  if (!name) {
    const err = new Error(`Aba "${sheetName}" ausente no arquivo.`);
    err.status = 400;
    err.code = 'SHEET_MISSING';
    throw err;
  }
  const sheet = workbook.Sheets[name];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });
  if (!rows.length) {
    return { sheetName: name, headers: [], dataRows: [] };
  }
  const headers = rows[0].map((h) => (h == null ? '' : String(h)));
  const dataRows = rows.slice(1).filter((r) => Array.isArray(r) && r.some((c) => c != null && String(c).trim() !== ''));
  return { sheetName: name, headers, dataRows };
}

function parseTblRm(workbook, sheetName = 'Requisição') {
  const { headers, dataRows, sheetName: resolved } = sheetToRows(workbook, sheetName);
  const col = buildColumnIndex(headers, RM_HEADER_MAP);
  if (col.n_requisicao == null || col.usuario == null) {
    const err = new Error(
      `Cabeçalho da aba ${resolved} incompleto: exige NRequisicao e Usuario.`
    );
    err.status = 400;
    throw err;
  }

  const solicitacoes = [];
  const seen = new Set();
  for (const row of dataRows) {
    const nReq = parseIntLike(cell(row, col.n_requisicao));
    const usuario = parseTexto(cell(row, col.usuario));
    if (nReq == null || !usuario) continue;

    const codRaw = cell(row, col.cod_filial);
    let codFilial = parseTexto(codRaw);
    if (codFilial == null && typeof codRaw === 'number' && Number.isFinite(codRaw)) {
      codFilial = String(Math.trunc(codRaw));
    }
    codFilial = codFilial || '';

    const pedidoContratoRaw = cell(row, col.pedido_contrato);
    let pedidoContrato = parseTexto(pedidoContratoRaw);
    if (pedidoContrato == null && typeof pedidoContratoRaw === 'number' && Number.isFinite(pedidoContratoRaw)) {
      pedidoContrato = String(Math.trunc(pedidoContratoRaw));
    }

    const item = {
      n_requisicao: nReq,
      requisitante: parseTexto(cell(row, col.requisitante)),
      usuario: usuario.toLowerCase(),
      status_geral: parseTexto(cell(row, col.status_geral)),
      tipo_documento: normalizeTipoDocumento(cell(row, col.tipo_documento)),
      pedido_contrato: pedidoContrato,
      fornecedor: parseTexto(cell(row, col.fornecedor)),
      valor_total_pedido: parseMoeda(cell(row, col.valor_total_pedido)),
      saldo_pedido: parseMoeda(cell(row, col.saldo_pedido)),
      data_emissao_pedido: parseDate(cell(row, col.data_emissao_pedido)),
      data_aprovacao_rm: parseDate(cell(row, col.data_aprovacao_rm)),
      mapa_cotacao: parseTexto(cell(row, col.mapa_cotacao)),
      numero_approvo: parseTexto(cell(row, col.numero_approvo)),
      centro_custo: parseTexto(cell(row, col.centro_custo)),
      nome_filial: parseTexto(cell(row, col.nome_filial)),
      cod_filial: codFilial,
    };

    const dedupeKey = dedupeKeyOf(item);
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    solicitacoes.push(item);
  }

  return { solicitacoes, linhas_lidas: dataRows.length, sheetName: resolved, headers, seen };
}

/**
 * Importa a aba Pedido.Contrato.Aditivo (fonte dos Pedidos/Contratos/Aditivos).
 * Número do documento → pedido_contrato; vincula RM/usuário quando a aba Requisição referencia o mesmo número.
 * Em conflito com linha da Requisição no mesmo documento+filial+tipo, prevalece esta aba.
 */
function mergePedidoContratoAditivo(workbook, solicitacoes, seen, sheetName = 'Pedido.Contrato.Aditivo') {
  let sheet;
  try {
    sheet = sheetToRows(workbook, sheetName);
  } catch (err) {
    if (err.code === 'SHEET_MISSING') return { adicionados: 0, atualizados: 0 };
    throw err;
  }

  const headers = sheet.headers.map((h) => compactHeader(h));
  const idx = {
    numero: headers.findIndex((h) => h === 'numero' || h === 'numerodocumento'),
    tipo: headers.findIndex((h) => h.includes('tipodedocumento') || h === 'tipodocumento'),
    filial: headers.findIndex((h) => h === 'filial' || h === 'codfilial'),
    status: headers.findIndex((h) => h === 'status'),
    valor: headers.findIndex((h) => h.includes('valor')),
    agente: headers.findIndex((h) => h === 'agente' || h === 'fornecedor'),
  };
  if (idx.numero < 0 || idx.tipo < 0) return { adicionados: 0, atualizados: 0 };

  const nomeByFilial = new Map();
  const byPedidoFilialTipo = new Map();
  const byPedido = new Map();
  const byPedidoFilial = new Map();

  for (const s of solicitacoes) {
    if (s.cod_filial && s.nome_filial) nomeByFilial.set(s.cod_filial, s.nome_filial);
    if (!s.pedido_contrato) continue;
    const kTipo = `${s.pedido_contrato}|${s.cod_filial || ''}|${s.tipo_documento || ''}`;
    byPedidoFilialTipo.set(kTipo, s);
    const kFilial = `${s.pedido_contrato}|${s.cod_filial || ''}`;
    if (!byPedidoFilial.has(kFilial)) byPedidoFilial.set(kFilial, s);
    if (!byPedido.has(s.pedido_contrato)) byPedido.set(s.pedido_contrato, s);
  }

  let adicionados = 0;
  let atualizados = 0;

  for (const row of sheet.dataRows) {
    const numero = parseIntLike(cell(row, idx.numero));
    if (numero == null) continue;
    const tipoDocumento = normalizeTipoDocumento(cell(row, idx.tipo));
    if (!tipoDocumento) continue;

    let codFilial = parseTexto(cell(row, idx.filial));
    const filRaw = cell(row, idx.filial);
    if (codFilial == null && typeof filRaw === 'number' && Number.isFinite(filRaw)) {
      codFilial = String(Math.trunc(filRaw));
    }
    codFilial = codFilial || '';

    const pedidoContrato = String(numero);
    const linked =
      byPedidoFilial.get(`${pedidoContrato}|${codFilial}`) ||
      byPedido.get(pedidoContrato) ||
      null;

    const item = {
      n_requisicao: linked?.n_requisicao ?? numero,
      requisitante: linked?.requisitante || null,
      usuario: linked?.usuario || '',
      status_geral: statusFromPedidoSheet(tipoDocumento, cell(row, idx.status)),
      tipo_documento: tipoDocumento,
      pedido_contrato: pedidoContrato,
      fornecedor: parseTexto(cell(row, idx.agente)),
      valor_total_pedido: parseMoeda(cell(row, idx.valor)),
      saldo_pedido: null,
      data_emissao_pedido: null,
      data_aprovacao_rm: null,
      mapa_cotacao: null,
      numero_approvo: null,
      centro_custo: linked?.centro_custo || null,
      nome_filial: linked?.nome_filial || nomeByFilial.get(codFilial) || null,
      cod_filial: codFilial,
    };

    const keyTipo = `${pedidoContrato}|${codFilial}|${tipoDocumento}`;
    const existing = byPedidoFilialTipo.get(keyTipo);
    if (existing) {
      const oldKey = dedupeKeyOf(existing);
      const idxExisting = solicitacoes.indexOf(existing);
      if (idxExisting >= 0) {
        solicitacoes[idxExisting] = item;
        seen.delete(oldKey);
        seen.add(dedupeKeyOf(item));
        byPedidoFilialTipo.set(keyTipo, item);
        atualizados += 1;
      }
      continue;
    }

    const dk = dedupeKeyOf(item);
    if (seen.has(dk)) continue;
    seen.add(dk);
    solicitacoes.push(item);
    byPedidoFilialTipo.set(keyTipo, item);
    byPedidoFilial.set(`${pedidoContrato}|${codFilial}`, item);
    if (!byPedido.has(pedidoContrato)) byPedido.set(pedidoContrato, item);
    adicionados += 1;
  }

  return { adicionados, atualizados, sheetName: sheet.sheetName };
}

function parseTblMatriz(workbook, sheetName = 'TblMatrizMensagens') {
  const { headers, dataRows, sheetName: resolved } = sheetToRows(workbook, sheetName);
  const col = buildColumnIndex(headers, MATRIZ_HEADER_MAP);
  if (col.status_geral == null || col.mensagem_template == null) {
    const err = new Error(
      `Cabeçalho da aba ${resolved} incompleto: exige StatusGeral e Mensagem.`
    );
    err.status = 400;
    throw err;
  }

  const itens = [];
  for (const row of dataRows) {
    const status = parseTexto(cell(row, col.status_geral));
    const mensagem = parseTexto(cell(row, col.mensagem_template));
    if (!status || !mensagem) continue;
    itens.push({
      status_geral: status,
      mensagem_template: mensagem,
      colunas_lidas: parseTexto(cell(row, col.colunas_lidas)),
    });
  }

  return { itens, linhas_lidas: dataRows.length, sheetName: resolved, headers };
}

/**
 * Estratégia principal: download do .xlsx + parse local (xlsx).
 * Alternativa (não usada): Graph Workbook API
 *   GET /sites/{siteId}/drive/items/{itemId}/workbook/worksheets/{aba}/usedRange
 */
function parseWorkbookBuffer(buffer, { abaRm = 'Requisição', abaMatriz = 'TblMatrizMensagens' } = {}) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const rm = parseTblRm(workbook, abaRm);
  const merge = mergePedidoContratoAditivo(workbook, rm.solicitacoes, rm.seen);
  rm.docs_adicionados = merge.adicionados || 0;
  rm.docs_atualizados = merge.atualizados || 0;

  // Garante unicidade após merge/replace da aba Pedido.Contrato.Aditivo
  const unique = new Map();
  for (const s of rm.solicitacoes) {
    unique.set(dedupeKeyOf(s), s);
  }
  rm.solicitacoes = [...unique.values()];
  rm.seen = new Set(rm.solicitacoes.map(dedupeKeyOf));

  let matriz = { itens: [], linhas_lidas: 0, sheetName: null, headers: [] };
  try {
    matriz = parseTblMatriz(workbook, abaMatriz);
  } catch (err) {
    if (err.code !== 'SHEET_MISSING') throw err;
  }
  return { rm, matriz, sheetNames: workbook.SheetNames };
}

function listSheetHeaders(buffer, sheetNames) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const result = {};
  for (const wanted of sheetNames) {
    try {
      const { headers, sheetName } = sheetToRows(workbook, wanted);
      result[wanted] = { ok: true, sheetName, headers: headers.slice(0, 40) };
    } catch (err) {
      result[wanted] = { ok: false, erro: err.message };
    }
  }
  return { sheetNames: workbook.SheetNames, abas: result };
}

module.exports = {
  parseWorkbookBuffer,
  listSheetHeaders,
  parseTblRm,
  parseTblMatriz,
  mergePedidoContratoAditivo,
  normalizeTipoDocumento,
};
