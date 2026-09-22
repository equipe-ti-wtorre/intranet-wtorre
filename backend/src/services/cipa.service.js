const XLSX = require('xlsx');
const { getPool } = require('../db/pool');
const cipaRepo = require('../repositories/cipa.repository');
const inscricaoService = require('./cipa-inscricao.service');
const permissoesService = require('./permissoes.service');
const { formatCpf } = require('../utils/cpf');
const { removeCipaImagem } = require('../config/cipa-upload');

function httpError(status, mensagem) {
  const err = new Error(mensagem);
  err.status = status;
  return err;
}

function isCipaAdmin(user, modulos = []) {
  return user?.perfil === 'ADMIN' || modulos.includes('agenda_rh');
}

function audienceCtx(user, modulos) {
  if (!user) {
    return { usuarioId: 0, microsoftId: '', isAdmin: false };
  }
  return {
    usuarioId: user.id,
    microsoftId: user.microsoft_id || '',
    isAdmin: isCipaAdmin(user, modulos),
  };
}

function isLinkPublico(row) {
  return !!row?.link_publico;
}

function parseJsonField(raw, fallback) {
  if (raw == null || raw === '') return fallback;
  if (Array.isArray(raw) || typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    throw httpError(400, 'JSON inválido no formulário.');
  }
}

function parseSlots(raw) {
  const arr = parseJsonField(raw, []);
  if (!Array.isArray(arr) || !arr.length) {
    throw httpError(400, 'Informe pelo menos um horário com vagas.');
  }
  const seen = new Set();
  return arr.map((item, idx) => {
    const horario = String(item.horario || '').slice(0, 5);
    if (!/^\d{2}:\d{2}$/.test(horario)) {
      throw httpError(400, `Horário inválido na linha ${idx + 1}. Use HH:MM.`);
    }
    const vagas = Number(item.vagas);
    if (!Number.isInteger(vagas) || vagas < 1) {
      throw httpError(400, `Vagas inválidas na linha ${idx + 1}.`);
    }
    if (seen.has(horario)) {
      throw httpError(400, `Horário duplicado: ${horario}.`);
    }
    seen.add(horario);
    return { horario, vagas };
  });
}

function parseColaboradorIds(raw) {
  const arr = parseJsonField(raw, []);
  if (!Array.isArray(arr)) {
    throw httpError(400, 'Lista de colaboradores inválida.');
  }
  const ids = arr
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n) && n > 0);
  return [...new Set(ids)];
}

function parseEventoBody(body) {
  const titulo = String(body.titulo || '').trim();
  if (!titulo) throw httpError(400, 'Informe o título do evento.');
  const data = String(body.data || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    throw httpError(400, 'Informe uma data válida.');
  }
  const estado = body.estado === 'encerrado' ? 'encerrado' : 'aberto';
  const duracao = Number(body.duracao_slot_min);
  const oculto =
    body.oculto_lista === true ||
    body.oculto_lista === '1' ||
    body.oculto_lista === 'true';
  const linkPublico =
    body.link_publico === true ||
    body.link_publico === '1' ||
    body.link_publico === 'true';
  const alinhamento = String(body.texto_alinhamento || '').trim();
  const textoEstilos = parseTextoEstilos(body.texto_estilos);
  const tituloEstilo = textoEstilos.titulo || {};
  const textoTamanho = Math.round(
    clampNumber(Number(tituloEstilo.tamanho ?? body.texto_tamanho), 18, 56, 32)
  );
  const textoAlinhamento =
    tituloEstilo.alinhamento === 'centro' || tituloEstilo.alinhamento === 'direita'
      ? tituloEstilo.alinhamento
      : alinhamento === 'centro' || alinhamento === 'direita'
        ? alinhamento
        : 'esquerda';
  textoEstilos.titulo = { tamanho: textoTamanho, alinhamento: textoAlinhamento };
  return {
    titulo,
    data,
    texto: String(body.texto || '').trim(),
    categoria: String(body.categoria || '').trim(),
    localizacao: String(body.localizacao || '').trim(),
    estado,
    duracao_slot_min: Number.isInteger(duracao) && duracao > 0 ? duracao : 60,
    oculto_lista: oculto,
    link_publico: linkPublico,
    imagem_zoom: clampNumber(Number(body.imagem_zoom), 100, 300, 100),
    imagem_tamanho: Math.round(clampNumber(Number(body.imagem_tamanho), 40, 100, 100)),
    imagem_altura: parseImagemAltura(body.imagem_altura),
    imagem_pos_x: clampNumber(Number(body.imagem_pos_x), 0, 100, 50),
    imagem_pos_y: clampNumber(Number(body.imagem_pos_y), 0, 100, 50),
    texto_tamanho: textoTamanho,
    texto_alinhamento: textoAlinhamento,
    texto_estilos: JSON.stringify(textoEstilos),
    slots: parseSlots(body.slots),
    colaborador_ids: parseColaboradorIds(body.colaborador_ids),
  };
}

const TEXTO_CAMPOS = {
  categoria: { min: 10, max: 20, def: 12 },
  titulo: { min: 18, max: 56, def: 32 },
  texto: { min: 11, max: 28, def: 15 },
  data: { min: 11, max: 22, def: 14 },
  localizacao: { min: 11, max: 22, def: 14 },
  vagas: { min: 11, max: 22, def: 14 },
  duracao: { min: 11, max: 22, def: 14 },
  sobre: { min: 12, max: 22, def: 14 },
};

function parseTextoEstilos(raw) {
  let obj = {};
  if (raw != null && raw !== '') {
    if (typeof raw === 'object') obj = raw;
    else {
      try {
        obj = JSON.parse(raw);
      } catch {
        obj = {};
      }
    }
  }
  if (!obj || typeof obj !== 'object') obj = {};
  const out = {};
  for (const [campo, meta] of Object.entries(TEXTO_CAMPOS)) {
    const item = obj[campo] || {};
    const alinhamento =
      item.alinhamento === 'centro' || item.alinhamento === 'direita' ? item.alinhamento : 'esquerda';
    out[campo] = {
      tamanho: Math.round(clampNumber(Number(item.tamanho), meta.min, meta.max, meta.def)),
      alinhamento,
    };
  }
  return out;
}

function clampNumber(value, min, max, fallback) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function parseImagemAltura(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 120) return 0;
  return Math.round(clampNumber(n, 120, 900, 0));
}

async function provisionarVisualizadores(colaboradorIds) {
  const itens = [];
  const seenUsers = new Set();
  for (const colaboradorId of colaboradorIds) {
    const user = await permissoesService.provisionarUsuarioDeColaborador(colaboradorId);
    if (seenUsers.has(user.id)) continue;
    seenUsers.add(user.id);
    itens.push({ usuario_id: user.id, colaborador_id: colaboradorId });
  }
  return itens;
}

async function montarPublico(eventoRow) {
  const slots = await cipaRepo.listarSlots(eventoRow.id);
  return {
    ...cipaRepo.mapEvento(eventoRow),
    slots,
  };
}

async function montarAdmin(eventoRow) {
  const [slots, visualizadores] = await Promise.all([
    cipaRepo.listarSlots(eventoRow.id),
    cipaRepo.listarVisualizadores(eventoRow.id),
  ]);
  return {
    ...cipaRepo.mapEvento(eventoRow),
    slots,
    visualizadores,
  };
}

async function listarPublicos(user, modulos) {
  return cipaRepo.listarPublicos(audienceCtx(user, modulos));
}

function parseCodigo(codigo) {
  const code = String(codigo || '').trim().toLowerCase();
  if (!/^[a-f0-9]{24}$/.test(code)) {
    throw httpError(404, 'Evento não encontrado.');
  }
  return code;
}

async function loadByCodigo(codigo) {
  const row = await cipaRepo.findByCodigo(parseCodigo(codigo));
  if (!row) throw httpError(404, 'Evento não encontrado.');
  return row;
}

async function resolverAcessoPublico(row, user, modulos, { deniedStatus, deniedMessage }) {
  if (isLinkPublico(row)) {
    return audienceCtx(user, modulos);
  }
  if (!user) {
    throw httpError(404, 'Evento não encontrado.');
  }
  const ctx = audienceCtx(user, modulos);
  if (ctx.isAdmin) return ctx;
  const pode = await cipaRepo.usuarioPodeVer(row.id, ctx);
  if (!pode) {
    throw httpError(deniedStatus, deniedMessage);
  }
  return ctx;
}

async function obterPublico(codigo, user, modulos) {
  const row = await loadByCodigo(codigo);
  const ctx = await resolverAcessoPublico(row, user, modulos, {
    deniedStatus: 404,
    deniedMessage: 'Evento não encontrado.',
  });
  if (row.estado === 'encerrado' && !ctx.isAdmin) {
    throw httpError(404, 'Evento não encontrado.');
  }
  return montarPublico(row);
}

async function obterImagemMeta(codigo, user, modulos) {
  const row = await loadByCodigo(codigo);
  if (!row.imagem) throw httpError(404, 'Imagem não encontrada.');
  await resolverAcessoPublico(row, user, modulos, {
    deniedStatus: 404,
    deniedMessage: 'Imagem não encontrada.',
  });
  return row.imagem;
}

async function inscrever(codigo, user, modulos, body) {
  const row = await loadByCodigo(codigo);
  await resolverAcessoPublico(row, user, modulos, {
    deniedStatus: 403,
    deniedMessage: 'Você não tem permissão para se inscrever neste evento.',
  });
  const evento = await montarPublico(row);
  return inscricaoService.inscrever(evento, Number(body.slot_id), user, body);
}

async function listarAdmin() {
  return cipaRepo.listarAdmin();
}

async function obterAdmin(codigo) {
  const row = await loadByCodigo(codigo);
  return montarAdmin(row);
}

async function criar(body, file) {
  const data = parseEventoBody(body);
  const visualizadores = await provisionarVisualizadores(data.colaborador_ids);
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const id = await cipaRepo.criarEvento(conn, {
      ...data,
      codigo: cipaRepo.gerarCodigoEvento(),
      imagem: file?.filename || null,
    });
    await cipaRepo.substituirSlots(conn, id, data.slots);
    await cipaRepo.substituirVisualizadores(conn, id, visualizadores);
    await conn.commit();
    const row = await cipaRepo.findById(id);
    return montarAdmin(row);
  } catch (err) {
    try {
      await conn.rollback();
    } catch {
      /* ignore */
    }
    if (file?.filename) removeCipaImagem(file.filename);
    throw err;
  } finally {
    conn.release();
  }
}

async function atualizar(codigo, body, file) {
  const atual = await loadByCodigo(codigo);
  const id = atual.id;
  const data = parseEventoBody(body);
  const visualizadores = await provisionarVisualizadores(data.colaborador_ids);
  const removerImagem =
    body.remover_imagem === true ||
    body.remover_imagem === '1' ||
    body.remover_imagem === 'true';

  let imagem = atual.imagem || null;
  if (file?.filename) {
    if (atual.imagem) removeCipaImagem(atual.imagem);
    imagem = file.filename;
  } else if (removerImagem) {
    if (atual.imagem) removeCipaImagem(atual.imagem);
    imagem = null;
  }

  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    await cipaRepo.atualizarEvento(conn, id, { ...data, imagem });
    await cipaRepo.substituirSlots(conn, id, data.slots);
    await cipaRepo.substituirVisualizadores(conn, id, visualizadores);
    await conn.commit();
    const row = await cipaRepo.findById(id);
    return montarAdmin(row);
  } catch (err) {
    try {
      await conn.rollback();
    } catch {
      /* ignore */
    }
    if (file?.filename) removeCipaImagem(file.filename);
    throw err;
  } finally {
    conn.release();
  }
}

async function excluir(codigo) {
  const atual = await loadByCodigo(codigo);
  await cipaRepo.excluirEvento(atual.id);
  if (atual.imagem) removeCipaImagem(atual.imagem);
  return { ok: true };
}

async function listarInscritos(codigo) {
  const atual = await loadByCodigo(codigo);
  const inscritos = await cipaRepo.listarInscritos(atual.id);
  return {
    evento: cipaRepo.mapEvento(atual),
    inscritos,
  };
}

async function excluirInscricao(codigo, inscricaoId) {
  const atual = await loadByCodigo(codigo);
  const ok = await cipaRepo.excluirInscricao(atual.id, inscricaoId);
  if (!ok) throw httpError(404, 'Inscrição não encontrada.');
  return { ok: true };
}

function formatDataPt(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).split('-');
  if (!d) return iso;
  return `${d}/${m}/${y}`;
}

async function exportarXlsx(codigo) {
  const atual = await loadByCodigo(codigo);
  const inscritos = await cipaRepo.listarInscritos(atual.id);
  const rows = [
    ['Nome', 'E-mail', 'CPF', 'Horário', 'Inscrito em'],
    ...inscritos.map((i) => [
      i.nome_completo,
      i.email,
      formatCpf(i.cpf),
      i.horario,
      i.criado_em ? new Date(i.criado_em).toLocaleString('pt-BR') : '',
    ]),
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Inscritos');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const slug = String(atual.titulo || 'evento')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return {
    buffer,
    filename: `cipa-${slug || atual.codigo}-${atual.data || atual.codigo}.xlsx`,
    evento: cipaRepo.mapEvento(atual),
  };
}

module.exports = {
  isCipaAdmin,
  listarPublicos,
  obterPublico,
  obterImagemMeta,
  inscrever,
  listarAdmin,
  obterAdmin,
  criar,
  atualizar,
  excluir,
  listarInscritos,
  excluirInscricao,
  exportarXlsx,
};
