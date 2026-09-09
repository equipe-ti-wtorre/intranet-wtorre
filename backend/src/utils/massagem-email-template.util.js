const CODIGOS = Object.freeze([
  'disparo_evento',
  'reserva_confirmada',
  'cancelamento',
  'fila_vaga',
  'falta_admin',
  'lembrete',
]);

const NOMES = Object.freeze({
  disparo_evento: 'Disparo novo evento',
  reserva_confirmada: 'Reserva confirmada',
  cancelamento: 'Cancelamento de reserva',
  fila_vaga: 'Vaga na fila',
  falta_admin: 'Falta registrada',
  lembrete: 'Lembrete 1 hora',
});

/** Chaves exibidas no editor (hint/chips) por tipo. */
const PLACEHOLDERS_POR_CODIGO = Object.freeze({
  reserva_confirmada: [
    'nome',
    'data_extenso',
    'hora',
    'unidade',
    'massoterapeuta',
    'duracao',
    'link_sistema',
    'empresa',
    'ano',
  ],
  cancelamento: ['nome', 'data_extenso', 'hora', 'unidade', 'link_sistema', 'empresa', 'ano'],
  fila_vaga: [
    'nome',
    'data_extenso',
    'unidade',
    'massoterapeuta',
    'link_reserva',
    'empresa',
    'ano',
  ],
  lembrete: ['nome', 'hora', 'duracao', 'unidade', 'massoterapeuta', 'empresa', 'ano'],
  falta_admin: [
    'nome_colaborador',
    'email_colaborador',
    'data_extenso',
    'hora',
    'unidade',
    'massoterapeuta',
    'total_fila',
    'link_admin',
    'empresa',
    'ano',
  ],
  disparo_evento: [
    'nome',
    'nome_evento',
    'data_extenso',
    'unidade',
    'massoterapeuta',
    'duracao',
    'total_vagas',
    'horarios',
    'link_reserva',
    'empresa',
    'ano',
  ],
});

function isCodigoValido(codigo) {
  return CODIGOS.includes(String(codigo || '').trim());
}

function render(str, vars = {}) {
  if (str == null) return '';
  return String(str).replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
    if (Object.prototype.hasOwnProperty.call(vars, key) && vars[key] != null) {
      return String(vars[key]);
    }
    return '';
  });
}

function formatDataCurta(iso) {
  const s = String(iso || '').slice(0, 10);
  const [y, m, d] = s.split('-');
  if (y && m && d) return `${d}/${m}/${y}`;
  return s || '';
}

function formatDataExtenso(iso) {
  const s = String(iso || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    if (s.includes('/')) return s;
    return s || '';
  }
  const [y, m, d] = s.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  if (Number.isNaN(date.getTime())) return formatDataCurta(iso);
  const texto = date.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function amostraVars(baseUrl = 'https://intranet.exemplo.com') {
  const base = String(baseUrl).replace(/\/$/, '');
  const linkReserva = `${base}/massagem/evento/1`;
  const linkSistema = `${base}/massagem/minhas-reservas`;
  const linkAdmin = `${base}/admin/massagem?aba=eventos`;
  const dataIso = '2026-08-15';
  return {
    nome: 'João Colaborador',
    nome_colaborador: 'João Colaborador',
    email_colaborador: 'joao.colaborador@empresa.com',
    data: formatDataCurta(dataIso),
    data_extenso: formatDataExtenso(dataIso),
    hora: '10:00',
    local: 'Sala Bem-estar',
    unidade: 'WTorre Corporativo',
    masso: 'Ana Silva',
    massoterapeuta: 'Ana Silva',
    duracao: '50',
    evento_nm: 'Sessão de massagem — Exemplo',
    nome_evento: 'Sessão de massagem — Exemplo',
    url: linkReserva,
    link_reserva: linkReserva,
    link_sistema: linkSistema,
    link_admin: linkAdmin,
    empresa: 'Grupo WTorre',
    ano: String(new Date().getFullYear()),
    total_vagas: '8',
    horarios: '08:00, 09:00, 10:00, 11:00',
    total_fila: '2',
    fila_texto: 'A fila de espera foi notificada (2 pessoas).',
  };
}

/**
 * Monta o mapa completo de variáveis para render/preview/envio.
 * @param {object} ctx
 */
function buildVars(ctx = {}) {
  const base = String(ctx.baseUrl || 'http://localhost:4201').replace(/\/$/, '');
  const evento = ctx.evento || {};
  const eventoId = evento.id != null ? String(evento.id) : '';
  const dataRaw = ctx.data || evento.data || '';
  const dataCurta = /^\d{4}-\d{2}-\d{2}/.test(String(dataRaw))
    ? formatDataCurta(dataRaw)
    : String(dataRaw || '');
  const dataExtenso = formatDataExtenso(dataRaw);
  const hora = ctx.hora || '';
  const masso = evento.masso || '';
  const horarios = Array.isArray(evento.horarios) ? evento.horarios : [];
  const linkReserva = eventoId ? `${base}/massagem/evento/${eventoId}` : `${base}/massagem`;
  const linkSistema = `${base}/massagem/minhas-reservas`;
  const linkAdmin = `${base}/admin/massagem?aba=eventos`;
  const nome = ctx.nome || '';
  const email = ctx.email || '';
  const totalFila = ctx.totalFila != null ? String(ctx.totalFila) : '';
  const duracao =
    evento.duracaoMin != null && evento.duracaoMin !== ''
      ? String(evento.duracaoMin)
      : '';

  return {
    nome,
    nome_colaborador: nome,
    email_colaborador: email,
    data: dataCurta,
    data_extenso: dataExtenso,
    hora,
    local: evento.local || '',
    unidade: evento.unidade || '',
    masso,
    massoterapeuta: masso,
    duracao,
    evento_nm: evento.nm || '',
    nome_evento: evento.nm || '',
    url: linkReserva,
    link_reserva: linkReserva,
    link_sistema: linkSistema,
    link_admin: linkAdmin,
    empresa: 'Grupo WTorre',
    ano: String(new Date().getFullYear()),
    total_vagas: horarios.length ? String(horarios.length) : '',
    horarios: horarios.join(', '),
    total_fila: totalFila,
    fila_texto: ctx.filaTexto || '',
  };
}

function renderTemplate({ assunto, html, texto }, vars) {
  return {
    assunto: render(assunto, vars),
    html: render(html, vars),
    texto: texto != null && String(texto).trim() ? render(texto, vars) : undefined,
  };
}

module.exports = {
  CODIGOS,
  NOMES,
  PLACEHOLDERS_POR_CODIGO,
  isCodigoValido,
  render,
  formatDataCurta,
  formatDataExtenso,
  amostraVars,
  buildVars,
  renderTemplate,
};
