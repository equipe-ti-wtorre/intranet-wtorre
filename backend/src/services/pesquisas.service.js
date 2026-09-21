const fs = require('fs');
const crypto = require('crypto');
const repo = require('../repositories/pesquisas.repository');
const usersRepo = require('../repositories/users.repository');
const comunicadosRepo = require('../repositories/comunicados.repository');
const catRepo = require('../repositories/comunicado-categorias.repository');
const contentVersionService = require('./content-version.service');
const blobService = require('./blob.service');
const cryptoService = require('./crypto.service');
const jwtService = require('./jwt.service');
const { env } = require('../config/env');

const PUBLICOS = ['todos', 'departamento', 'externos', 'personalizado'];
const EVENTO_TIPOS = ['show', 'jogo', 'outro'];
const PERGUNTA_TIPOS = ['texto_curto', 'texto_longo', 'multipla_escolha', 'escala', 'sim_nao'];
const BLOCO_TIPOS = ['pergunta', 'texto', 'anexo'];
const CAPA_LAYOUTS = ['top', 'bottom', 'left', 'right'];
const CONDICOES = ['qualquer', 'sim', 'nao', 'escala_gte_4'];
const REQ_TIPOS = ['compra', 'ti', 'rh', 'manutencao', 'outro'];
const PRIORIDADES = ['baixa', 'media', 'alta'];
const APROVADOR_ROTULOS = [
  'Gestor direto',
  'Coordenador de RH',
  'Coordenador de TI',
  'Diretoria',
];
const FORM_LISTAS = ['form-pending', 'form-answered', 'form-created'];
const REQ_LISTAS = ['req-pending', 'req-answered', 'req-created'];
const ORIGEM_FORM = 'pesquisas_formulario';
const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function httpError(status, mensagem) {
  const err = new Error(mensagem);
  err.status = status;
  return err;
}

function isAdminPesquisas(req) {
  return req.user?.perfil === 'ADMIN' || (req.userModulos || []).includes('pesquisas');
}

function normalizeUsuarioIds(raw) {
  const ids = [];
  const seen = new Set();
  for (const item of Array.isArray(raw) ? raw : []) {
    const n = Number(item);
    if (!Number.isInteger(n) || n < 1 || seen.has(n)) continue;
    seen.add(n);
    ids.push(n);
  }
  return ids;
}

async function resolveDestinatarioIds(body, publicoAlvo) {
  if (publicoAlvo !== 'personalizado') return [];
  return repo.filterUsuariosAtivos(normalizeUsuarioIds(body?.usuarioIds));
}

async function persistDestinatarios(formId, publicoAlvo, usuarioIds, { publicar } = {}) {
  if (publicoAlvo === 'personalizado') {
    await repo.replaceDestinatarios(formId, usuarioIds);
    if (publicar && !usuarioIds.length) {
      throw httpError(
        400,
        'Inclua ao menos um colaborador para publicar o formulário personalizado.'
      );
    }
    return;
  }
  await repo.replaceDestinatarios(formId, []);
}

async function assertElegivelIntranet(form, user) {
  if (form.publicoAlvo === 'externos') {
    throw httpError(403, 'Este formulário é para convidados externos. Use o link público.');
  }
  if (
    form.publicoAlvo === 'departamento' &&
    (user.departamento || '') !== (form.publicoDepartamento || '')
  ) {
    throw httpError(403, 'Este formulário não está disponível para o seu departamento.');
  }
  if (form.publicoAlvo === 'personalizado') {
    const ok = await repo.isDestinatario(form.id, user.id);
    if (!ok) {
      throw httpError(403, 'Este formulário não está disponível para você.');
    }
  }
}

function parseId(raw) {
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) {
    throw httpError(400, 'Identificador inválido.');
  }
  return id;
}

function str(value, max) {
  const s = String(value ?? '').trim();
  return max ? s.slice(0, max) : s;
}

function parseDate(value) {
  if (value == null || value === '') return null;
  const s = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    throw httpError(400, 'Data inválida.');
  }
  return s;
}

function parseTime(value) {
  if (value == null || value === '') return null;
  const m = String(value)
    .trim()
    .match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!m) throw httpError(400, 'Horário inválido.');
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh > 23 || mm > 59) throw httpError(400, 'Horário inválido.');
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function parseJanelaCampo(isoVal, dateVal, timeVal, defaultTime) {
  const iso = isoVal != null && isoVal !== '' ? String(isoVal).trim() : '';
  if (iso && (iso.includes('T') || /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(iso))) {
    const m = iso.replace(' ', 'T').match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
    if (!m) throw httpError(400, 'Data e horário inválidos.');
    return `${m[1]} ${m[2]}:00`;
  }
  if (/^\d{1,2}:\d{2}(?::\d{2})?$/.test(iso)) {
    throw httpError(400, 'Informe a data junto com o horário.');
  }
  const date = parseDate(dateVal || (iso.length === 10 ? iso : '') || null);
  const time = parseTime(timeVal);
  if (time && !date) throw httpError(400, 'Informe a data junto com o horário.');
  if (!date) return null;
  return `${date} ${time || defaultTime}:00`;
}

function parseJanela(body) {
  const prazoInicio = parseJanelaCampo(
    body.prazoInicio,
    body.prazoInicioData,
    body.prazoInicioHora,
    '00:00'
  );
  const prazoFim = parseJanelaCampo(body.prazoFim, body.prazoFimData, body.prazoFimHora, '23:59');
  if (prazoInicio && prazoFim && prazoInicio >= prazoFim) {
    throw httpError(400, 'O início da janela deve ser anterior ao fim.');
  }
  return { prazoInicio, prazoFim };
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

function toSqlDateTime(iso) {
  if (!iso) return null;
  const m = String(iso).replace(' ', 'T').match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  return m ? `${m[1]} ${m[2]}:00` : null;
}

function assertJanelaAberta(form) {
  const now = nowSaoPauloSql();
  const ini = toSqlDateTime(form.prazoInicio);
  const fim = toSqlDateTime(form.prazoFim);
  if (ini && now < ini) {
    throw httpError(409, 'Este formulário ainda não está disponível.');
  }
  if (fim && now > fim) {
    throw httpError(409, 'O prazo deste formulário já encerrou.');
  }
}

function janelaFora(form) {
  const now = nowSaoPauloSql();
  const ini = toSqlDateTime(form.prazoInicio);
  const fim = toSqlDateTime(form.prazoFim);
  if (ini && now < ini) return 'antes';
  if (fim && now > fim) return 'depois';
  return null;
}

function formatBrDate(iso) {
  if (!iso) return null;
  const d = iso.slice(0, 10);
  const [y, m, day] = d.split('-');
  if (!y || !m || !day) return null;
  return `${day}/${m}/${y}`;
}

function formatBrDateTime(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return formatBrDate(iso);
  return d.toLocaleDateString('pt-BR');
}

function isBlocoPergunta(p) {
  return !p.blocoTipo || p.blocoTipo === 'pergunta';
}

function normalizePerguntas(raw, { logicaOn, secoesOn, allowEmpty }) {
  if (!Array.isArray(raw) || !raw.length) {
    if (allowEmpty) return [];
    throw httpError(400, 'Inclua ao menos um campo no formulário.');
  }
  return raw.map((p, idx) => {
    const blocoTipo = BLOCO_TIPOS.includes(p.blocoTipo) ? p.blocoTipo : 'pergunta';
    const ajuda = str(p.ajuda, 500) || null;
    const novaLinha = p.novaLinha !== false;
    if (blocoTipo === 'texto') {
      const estilo =
        p.textoEstilo === 'titulo' || (Array.isArray(p.opcoes) && p.opcoes[0] === 'titulo')
          ? 'titulo'
          : 'paragrafo';
      return {
        ordem: idx + 1,
        texto: str(p.texto, 500) || 'Texto',
        tipo: 'texto_curto',
        obrigatoria: false,
        opcoes: [estilo],
        secaoTitulo: null,
        logica: null,
        blocoTipo,
        ajuda,
        novaLinha,
      };
    }
    if (blocoTipo === 'anexo') {
      return {
        ordem: idx + 1,
        texto: str(p.texto, 500) || 'Anexar arquivo',
        tipo: 'texto_curto',
        obrigatoria: p.obrigatoria !== false,
        opcoes: null,
        secaoTitulo: secoesOn ? str(p.secaoTitulo, 200) || null : null,
        logica: null,
        blocoTipo,
        ajuda,
        novaLinha,
      };
    }
    const texto = str(p.texto, 500);
    if (!texto) throw httpError(400, `Informe o texto da pergunta ${idx + 1}.`);
    const tipo = PERGUNTA_TIPOS.includes(p.tipo) ? p.tipo : 'texto_curto';
    let opcoes = [];
    if (tipo === 'multipla_escolha') {
      opcoes = (Array.isArray(p.opcoes) ? p.opcoes : [])
        .map((o) => str(o, 200))
        .filter(Boolean);
      if (opcoes.length < 2) {
        throw httpError(400, `A pergunta ${idx + 1} precisa de ao menos duas opções.`);
      }
    }
    let logica = null;
    if (logicaOn && idx > 0 && p.logica) {
      const condicao = CONDICOES.includes(p.logica.condicao) ? p.logica.condicao : 'qualquer';
      const perguntaOrdem = Number(p.logica.perguntaOrdem) || idx;
      logica = { perguntaOrdem, condicao };
    }
    return {
      ordem: idx + 1,
      texto,
      tipo,
      obrigatoria: p.obrigatoria !== false,
      opcoes: tipo === 'multipla_escolha' ? opcoes : null,
      secaoTitulo: secoesOn ? str(p.secaoTitulo, 200) || null : null,
      logica,
      blocoTipo,
      ajuda,
      novaLinha,
    };
  });
}

function normalizeFormBody(body, { criadorId } = {}) {
  const titulo = str(body.titulo, 255) || (body._allowEmptyTitle ? 'Sem título' : '');
  if (!titulo) throw httpError(400, 'Informe o título do formulário.');
  const categoria = str(body.categoria, 80) || 'Sem categoria';
  const publicoAlvo = PUBLICOS.includes(body.publicoAlvo) ? body.publicoAlvo : 'todos';
  const publicoDepartamento =
    publicoAlvo === 'departamento' ? str(body.publicoDepartamento, 200) || null : null;
  if (publicoAlvo === 'departamento' && !publicoDepartamento) {
    throw httpError(400, 'Informe o departamento do público-alvo.');
  }
  const tipo = 'avancado';
  const secoes = !!body.secoes;
  const logicaCondicional = !!body.logicaCondicional;
  const anonimo = !!body.anonimo;
  const perguntas = normalizePerguntas(body.perguntas, {
    logicaOn: logicaCondicional,
    secoesOn: secoes,
    allowEmpty: !!body._allowEmptyPerguntas,
  });
  let eventoTipo = null;
  let eventoTipoOutro = null;
  const eventoAtivo = body.eventoAtivo !== false;
  let exigirIdentidade = true;
  if (publicoAlvo === 'externos') {
    eventoTipo = EVENTO_TIPOS.includes(body.eventoTipo) ? body.eventoTipo : 'outro';
    eventoTipoOutro = eventoTipo === 'outro' ? str(body.eventoTipoOutro, 80) || null : null;
    exigirIdentidade = body.exigirIdentidade !== false;
  }
  const { prazoInicio, prazoFim } = parseJanela(body);
  const capaLayout = CAPA_LAYOUTS.includes(body.capaLayout) ? body.capaLayout : 'top';
  return {
    criadorId,
    titulo,
    descricao: str(body.descricao, 4000),
    categoria,
    prazo: prazoFim ? prazoFim.slice(0, 10) : parseDate(body.prazo),
    prazoInicio,
    prazoFim,
    publicoAlvo,
    publicoDepartamento,
    tipo,
    secoes,
    logicaCondicional,
    anonimo,
    perguntas,
    eventoTipo,
    eventoTipoOutro,
    eventoAtivo,
    exigirIdentidade,
    capaLayout,
  };
}

async function uniquePublicToken() {
  for (let i = 0; i < 24; i += 1) {
    const token = crypto.randomBytes(16).toString('base64url');
    if (!(await repo.slugExists(token))) return token;
  }
  throw httpError(500, 'Não foi possível gerar o link público.');
}

function digitsCpf(raw) {
  return String(raw || '').replace(/\D/g, '');
}

function normHeader(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[_./-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function isDocHeader(raw) {
  return ['cpf', 'cnpj', 'cpf cnpj', 'documento', 'doc'].includes(normHeader(raw));
}

function isEmailHeader(raw) {
  return ['email', 'e mail', 'mail', 'correio'].includes(normHeader(raw));
}

function isNomeHeader(raw) {
  return ['nome', 'nome completo', 'name', 'razao social', 'razão social'].includes(normHeader(raw));
}

function extractGuestsFromRows(rows) {
  const guests = [];
  const seen = new Set();
  const list = Array.isArray(rows) ? rows : [];
  for (const row of list) {
    if (!row || typeof row !== 'object') continue;
    let nome = '';
    let cpf = '';
    let email = '';
    for (const [k, v] of Object.entries(row)) {
      const cell = String(v ?? '').trim();
      if (!cell) continue;
      if (!nome && isNomeHeader(k)) nome = cell.slice(0, 200);
      if (!cpf && isDocHeader(k)) {
        const digits = digitsCpf(cell);
        if (digits.length === 11 || digits.length === 14) cpf = digits;
      }
      if (!email && isEmailHeader(k) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cell.toLowerCase())) {
        email = cell.toLowerCase().slice(0, 200);
      }
    }
    if (!cpf || !email || seen.has(cpf)) continue;
    seen.add(cpf);
    guests.push({ nome, cpf, email });
  }
  return { guests, ignoradas: Math.max(0, list.length - guests.length) };
}

function extractChavesFromDados(dados) {
  let chaveDoc = null;
  let chaveEmail = null;
  for (const [k, v] of Object.entries(dados || {})) {
    const cell = String(v ?? '').trim();
    if (!cell) continue;
    if (isDocHeader(k)) {
      const digits = digitsCpf(cell);
      if (digits.length === 11 || digits.length === 14) {
        chaveDoc = cryptoService.hmacSha256(digits);
      }
    }
    if (isEmailHeader(k) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cell)) {
      chaveEmail = cell.toLowerCase();
    }
  }
  return { chaveDoc, chaveEmail };
}

function normalizeBaseRows(raw) {
  if (!Array.isArray(raw)) return [];
  if (raw.length > 5000) {
    throw httpError(400, 'A planilha pode ter no máximo 5.000 linhas.');
  }
  const out = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const keys = Object.keys(row).slice(0, 40);
    if (!keys.length) continue;
    const dados = {};
    for (const k of keys) {
      const header = str(k, 120);
      if (!header) continue;
      dados[header] = str(row[k], 500);
    }
    if (!Object.keys(dados).length) continue;
    const { chaveDoc, chaveEmail } = extractChavesFromDados(dados);
    out.push({ chaveDoc, chaveEmail, dados });
  }
  return out;
}

async function maybeReplaceBase(formId, body, publicoAlvo) {
  if (publicoAlvo !== 'externos') {
    await repo.replaceFormularioBase(formId, []);
    return;
  }
  if (!Array.isArray(body?.base)) return;
  await repo.replaceFormularioBase(formId, normalizeBaseRows(body.base));
}

async function baseResumo(formId) {
  return repo.summarizeFormularioBase(formId);
}

function lookupKeysFromValor(raw) {
  const valor = str(raw, 200);
  if (!valor) return { chaveDoc: null, chaveEmail: null };
  const digits = digitsCpf(valor);
  if (digits.length === 11 || digits.length === 14) {
    return { chaveDoc: cryptoService.hmacSha256(digits), chaveEmail: null };
  }
  if (valor.includes('@')) {
    return { chaveDoc: null, chaveEmail: valor.toLowerCase() };
  }
  return { chaveDoc: null, chaveEmail: null };
}

function isDocumentoValido(digits) {
  return digits.length === 11 || digits.length === 14;
}

function maskDocumento(digits) {
  if (digits.length === 14) {
    return `**.${digits.slice(2, 5)}.***/${digits.slice(8, 12)}-${digits.slice(12)}`;
  }
  return `***.${digits.slice(3, 6)}.**${digits[8]}-${digits.slice(9)}`;
}

function guestsHaveFreshDocumento(raw) {
  return Array.isArray(raw) && raw.some((g) => isDocumentoValido(digitsCpf(g?.cpf)));
}

async function resolveConvidadosFromBody(body, formularioId) {
  const fontePlanilha = body?.convidadosFonte === 'planilha';
  const rawGuests = Array.isArray(body?.convidados) ? body.convidados : null;
  if (fontePlanilha && !guestsHaveFreshDocumento(rawGuests)) {
    let rows = Array.isArray(body.base) ? body.base : null;
    if (!rows && formularioId) {
      rows = await repo.listFormularioBaseDados(formularioId);
    }
    const extracted = extractGuestsFromRows(rows);
    if (extracted.guests.length) {
      return normalizeConvidados(extracted.guests, formularioId);
    }
    if (rows && rows.length) {
      throw httpError(
        400,
        'A planilha precisa de colunas de CPF/CNPJ e e-mail para cadastrar convidados.'
      );
    }
  }
  if (rawGuests) {
    return normalizeConvidados(rawGuests, formularioId);
  }
  return null;
}

async function normalizeConvidados(raw, formularioId) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const g of raw) {
    const nome = str(g.nome, 200) || null;
    const email = str(g.email, 200).toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw httpError(400, 'Informe um e-mail válido para cada convidado.');
    }
    const doc = digitsCpf(g.cpf);
    let cpfHash;
    let cpfMascara;
    if (isDocumentoValido(doc)) {
      cpfHash = cryptoService.hmacSha256(doc);
      cpfMascara = maskDocumento(doc);
    } else if (formularioId && g.id) {
      const prev = await repo.findConvidadoHash(formularioId, Number(g.id));
      if (!prev) {
        throw httpError(400, 'Cada convidado precisa de um CPF (11 dígitos) ou CNPJ (14 dígitos).');
      }
      cpfHash = prev.cpfHash;
      cpfMascara = prev.cpfMascara;
    } else {
      throw httpError(400, 'Cada convidado precisa de um CPF (11 dígitos) ou CNPJ (14 dígitos).');
    }
    if (seen.has(cpfHash)) {
      throw httpError(400, 'Há CPF ou CNPJ duplicados na lista de convidados.');
    }
    seen.add(cpfHash);
    out.push({ nome, email, cpfHash, cpfMascara });
  }
  return out;
}

function perguntaVisivel(pergunta, perguntas, respostasPorId) {
  if (!pergunta.logica) return true;
  const alvo = perguntas.find((p) => p.ordem === Number(pergunta.logica.perguntaOrdem));
  if (!alvo) return true;
  const valor = respostasPorId.get(alvo.id);
  const c = pergunta.logica.condicao;
  if (c === 'qualquer') return true;
  if (c === 'sim') return valor === 'Sim';
  if (c === 'nao') return valor === 'Não';
  if (c === 'escala_gte_4') return Number(valor) >= 4;
  return true;
}

function badgeFormCriado(form) {
  if (form.status === 'rascunho') return 'draft';
  if (form.status === 'encerrado') return 'done';
  return 'review';
}

function formatBrDateTimeShort(iso) {
  const sql = toSqlDateTime(iso);
  if (!sql) return formatBrDate(iso);
  const [date, time] = sql.split(' ');
  const br = formatBrDate(date);
  return br ? `${br} ${time.slice(0, 5)}` : null;
}

function dateLabelForm(form, lista) {
  if (lista === 'form-pending') {
    const ini = form.prazoInicio;
    const fim = form.prazoFim;
    if (ini && fim) return `De ${formatBrDateTimeShort(ini)} a ${formatBrDateTimeShort(fim)}`;
    if (ini) return `A partir de ${formatBrDateTimeShort(ini)}`;
    if (fim) return `Até ${formatBrDateTimeShort(fim)}`;
    return form.prazo ? `Prazo: ${formatBrDate(form.prazo)}` : 'Sem prazo';
  }
  if (lista === 'form-answered') {
    return form.respondidoEm
      ? `Respondido em ${formatBrDateTime(form.respondidoEm)}`
      : 'Respondido';
  }
  if (form.status === 'rascunho') return 'Rascunho';
  const n = form.totalRespostas || 0;
  return n === 1 ? '1 resposta' : `${n} respostas`;
}

function toFormListItem(form, lista) {
  let status = 'pending';
  if (lista === 'form-answered') status = 'done';
  else if (lista === 'form-created') status = badgeFormCriado(form);
  return {
    id: form.id,
    kind: 'formulario',
    title: form.titulo,
    category: form.categoria,
    date: dateLabelForm(form, lista),
    status,
    formStatus: form.status,
    tipo: form.tipo,
    totalRespostas: form.totalRespostas,
    criadoEm: form.respondidoEm || form.criadoEm || null,
    createdDate: formatBrDateTime(form.criadoEm),
    publicoAlvo: form.publicoAlvo,
    publicoDepartamento: form.publicoDepartamento,
    slug: form.slug || null,
    eventoAtivo: form.eventoAtivo,
    eventoTipo: form.eventoTipo,
    totalConvidados: form.totalConvidados,
    janela: janelaFora(form),
    prazoInicio: form.prazoInicio || null,
    prazoFim: form.prazoFim || null,
  };
}

function badgeReq(reqItem, lista) {
  if (lista === 'req-pending') return 'pending';
  if (lista === 'req-answered') return 'done';
  if (reqItem.status === 'rascunho') return 'draft';
  if (reqItem.status === 'concluida' || reqItem.status === 'rejeitada') return 'done';
  return 'review';
}

function tipoReqLabel(tipo) {
  return (
    {
      compra: 'Compra',
      ti: 'TI / Suporte',
      rh: 'RH',
      manutencao: 'Manutenção',
      outro: 'Outro',
    }[tipo] || tipo
  );
}

function dateLabelReq(reqItem, lista) {
  if (lista === 'req-pending') {
    return reqItem.criadoEm ? `Aberta em ${formatBrDateTime(reqItem.criadoEm)}` : 'Aberta';
  }
  if (lista === 'req-answered') {
    const d = reqItem.decididoEm || reqItem.atualizadoEm;
    const label = reqItem.status === 'rejeitada' ? 'Rejeitada' : 'Concluída';
    return d ? `${label} em ${formatBrDateTime(d)}` : label;
  }
  if (reqItem.status === 'rascunho') return 'Rascunho';
  if (reqItem.status === 'pendente' || reqItem.status === 'em_andamento') {
    return 'Aguardando aprovação';
  }
  if (reqItem.status === 'rejeitada') {
    return reqItem.decididoEm
      ? `Rejeitada em ${formatBrDateTime(reqItem.decididoEm)}`
      : 'Rejeitada';
  }
  return reqItem.decididoEm
    ? `Concluída em ${formatBrDateTime(reqItem.decididoEm)}`
    : 'Concluída';
}

function toReqListItem(reqItem, lista) {
  return {
    id: reqItem.id,
    kind: 'requisicao',
    title: reqItem.titulo,
    category: tipoReqLabel(reqItem.tipo),
    date: dateLabelReq(reqItem, lista),
    status: badgeReq(reqItem, lista),
    reqStatus: reqItem.status,
    prioridade: reqItem.prioridade,
    criadoEm: reqItem.criadoEm || reqItem.decididoEm || null,
    createdDate: formatBrDateTime(reqItem.criadoEm),
  };
}

function matchQuery(item, q) {
  if (!q) return true;
  const n = q.toLowerCase();
  return item.title.toLowerCase().includes(n) || item.category.toLowerCase().includes(n);
}

async function getFormularioPorId(id, { includeConvidados } = {}) {
  const form = await repo.findFormularioById(id);
  const perguntas = await repo.listPerguntas(id);
  const convidados = includeConvidados ? await repo.listConvidados(id) : undefined;
  const destinatarios = includeConvidados ? await repo.listDestinatarios(id) : undefined;
  const resumoBase = await baseResumo(id);
  return decorateForm({
    ...form,
    perguntas,
    ...(convidados ? { convidados } : {}),
    ...(destinatarios ? { destinatarios } : {}),
    baseResumo: resumoBase,
  });
}

function stripCapaSecrets(form) {
  const { capaContainer, capaBlob, ...rest } = form;
  return { ...rest, temCapa: !!(capaContainer && capaBlob) };
}

async function resolveCapaUrl(form) {
  if (!form.capaContainer || !form.capaBlob) return null;
  let lastErr = null;
  for (let i = 0; i < 2; i += 1) {
    try {
      const sas = await blobService.gerarSasLeitura(form.capaContainer, form.capaBlob);
      if (sas?.url) return sas.url;
    } catch (err) {
      lastErr = err;
    }
  }
  console.error(
    '[pesquisas] falha ao gerar SAS da capa:',
    lastErr?.message || lastErr,
    form.capaContainer,
    form.capaBlob
  );
  return null;
}

function templateVisual(t) {
  if (!t) return null;
  return {
    codigo: t.codigo,
    nome: t.nome,
    wordmark: t.wordmark,
    corPrimaria: t.corPrimaria,
    corPrimariaEscura: t.corPrimariaEscura,
    raioPx: t.raioPx,
  };
}

async function resolveTemplate(codigo) {
  let t = await repo.findTemplateByCodigo(codigo || 'wtorre');
  if (!t || !t.ativo) t = await repo.findTemplateByCodigo('wtorre');
  return (
    templateVisual(t) || {
      codigo: 'wtorre',
      nome: 'WTorre',
      wordmark: 'WTORRE',
      corPrimaria: '#1d54e6',
      corPrimariaEscura: '#0b2a6b',
      raioPx: 10,
    }
  );
}

async function decorateForm(form, extra = {}) {
  if (!form) return form;
  const template = await resolveTemplate(form.templateCodigo);
  const capaUrl = await resolveCapaUrl(form);
  return { ...stripCapaSecrets(form), template, capaUrl, janela: janelaFora(form), ...extra };
}

async function resolveTemplateCodigo(raw) {
  const codigo = str(raw, 40).toLowerCase() || 'wtorre';
  const t = await repo.findTemplateByCodigo(codigo);
  if (t && t.ativo) return t.codigo;
  return 'wtorre';
}

async function syncComunicadoFormulario(form, { ativo, userId, bump = true }) {
  const cat = await catRepo.buscarPorSlug('pesquisas');
  if (!cat) {
    console.error('[pesquisas] Categoria de comunicados "pesquisas" não encontrada.');
    return false;
  }
  const linkPath = `/pesquisas/formulario/${form.id}/responder`;
  const wantAtivo = !!ativo;
  const existing = await comunicadosRepo.buscarPorOrigem(ORIGEM_FORM, form.id);
  if (
    existing &&
    existing.titulo === form.titulo &&
    existing.ativo === wantAtivo &&
    existing.linkPath === linkPath &&
    existing.categoriaId === cat.id
  ) {
    return false;
  }
  const today = nowSaoPauloSql().slice(0, 10);
  await comunicadosRepo.upsertOrigem({
    titulo: form.titulo,
    categoria_id: cat.id,
    data_publicacao: today,
    ordem: null,
    ativo: wantAtivo,
    criado_por: userId || form.criadorId || null,
    link_path: linkPath,
    origem: ORIGEM_FORM,
    origem_id: form.id,
  });
  if (bump) await contentVersionService.bump('comunicados');
  return true;
}

async function desativarComunicadoFormulario(formId, { bump = true } = {}) {
  const existing = await comunicadosRepo.buscarPorOrigem(ORIGEM_FORM, formId);
  if (!existing) return false;
  if (existing.ativo) {
    await comunicadosRepo.setAtivo(existing.id, false);
    if (bump) await contentVersionService.bump('comunicados');
    return true;
  }
  return false;
}

async function removerComunicadoFormulario(formId) {
  const existing = await comunicadosRepo.buscarPorOrigem(ORIGEM_FORM, formId);
  if (!existing) return;
  await comunicadosRepo.remover(existing.id);
  await contentVersionService.bump('comunicados');
}

async function atualizarComunicadoDoFormulario(form, userId, { bump = true } = {}) {
  if (!form?.id) return false;
  if (form.publicoAlvo === 'externos' || form.status !== 'publicado' || !form.eventoAtivo) {
    return desativarComunicadoFormulario(form.id, { bump });
  }
  return syncComunicadoFormulario(form, {
    ativo: !janelaFora(form),
    userId,
    bump,
  });
}

async function sincronizarComunicadosJanela() {
  const forms = await repo.listFormulariosInternosPublicados();
  let changed = false;
  for (const form of forms) {
    const did = await atualizarComunicadoDoFormulario(form, form.criadorId, { bump: false });
    if (did) changed = true;
  }
  if (changed) await contentVersionService.bump('comunicados');
  return changed;
}

async function resumo(req) {
  const user = req.user;
  const [
    formPending,
    formAnswered,
    formCreated,
    reqPending,
    reqAnswered,
    reqCreated,
    publicados,
    rascunhos,
    respostasRecebidas,
  ] = await Promise.all([
    repo.countFormulariosPendentes(user),
    repo.countFormulariosRespondidos(user.id),
    repo.countFormulariosCriados(user.id),
    repo.countRequisicoesPendentes(user.id),
    repo.countRequisicoesRespondidas(user.id),
    repo.countRequisicoesCriadas(user.id),
    repo.countFormulariosPorStatus(user.id, 'publicado'),
    repo.countFormulariosPorStatus(user.id, 'rascunho'),
    repo.countRespostasRecebidas(user.id),
  ]);
  return {
    formPending,
    formAnswered,
    formCreated,
    reqPending,
    reqAnswered,
    reqCreated,
    itensCriados: formCreated + reqCreated,
    publicados,
    rascunhos,
    respostasRecebidas,
  };
}

async function listFormularios(req) {
  const lista = String(req.query.lista || '');
  if (!FORM_LISTAS.includes(lista)) {
    throw httpError(400, 'Lista de formulários inválida.');
  }
  const q = str(req.query.q, 120).toLowerCase();
  const statusFilter = str(req.query.status, 20);
  let rows = [];
  if (lista === 'form-pending') rows = await repo.listFormulariosPendentes(req.user);
  else if (lista === 'form-answered') rows = await repo.listFormulariosRespondidos(req.user.id);
  else rows = await repo.listFormulariosCriados(req.user.id);

  const items = rows
    .map((f) => toFormListItem(f, lista))
    .filter((it) => matchQuery(it, q))
    .filter((it) => !statusFilter || statusFilter === 'all' || it.status === statusFilter);

  if (lista === 'form-created' && items.length) {
    const all = await repo.countUsuariosAtivos();
    const depts = new Map();
    for (const row of rows) {
      const dept = row.publicoDepartamento;
      if (row.publicoAlvo === 'departamento' && dept && !depts.has(dept)) {
        depts.set(dept, await repo.countUsuariosAtivos(dept));
      }
    }
    const byId = new Map(rows.map((r) => [r.id, r]));
    for (const it of items) {
      const form = byId.get(it.id);
      if (!form) continue;
      it.publicoAlvoTotal =
        form.publicoAlvo === 'externos'
          ? form.totalConvidados || 0
          : form.publicoAlvo === 'personalizado'
            ? form.totalDestinatarios || 0
            : form.publicoAlvo === 'departamento'
              ? depts.get(form.publicoDepartamento) || 0
              : all;
    }
  }

  return items;
}

async function getFormulario(req) {
  const id = parseId(req.params.id);
  const form = await repo.findFormularioById(id);
  if (!form) throw httpError(404, 'Formulário não encontrado.');
  const owner = form.criadorId === req.user.id;
  const admin = isAdminPesquisas(req);
  if (!owner && !admin) throw httpError(403, 'Você não pode editar este formulário.');
  const perguntas = await repo.listPerguntas(id);
  const convidados = await repo.listConvidados(id);
  const destinatarios = await repo.listDestinatarios(id);
  const resumoBase = await baseResumo(id);
  return decorateForm({ ...form, perguntas, convidados, destinatarios, baseResumo: resumoBase });
}

function tituloCopia(titulo) {
  const base = str(titulo, 255) || 'Sem título';
  return `Cópia de ${base}`.slice(0, 255);
}

async function copiarCapaFormulario(fromId, toId) {
  const capa = await repo.findFormularioCapa(fromId);
  if (!capa) return;
  const downloaded = await blobService.baixarBuffer(capa.container, capa.blob);
  const container = await blobService.garantirContainer(env.pesquisasContainer);
  const blobName = blobService.novoBlobName(capa.nome || downloaded.filename || 'capa');
  await blobService.enviarBuffer(container, downloaded.buffer, blobName, downloaded.contentType);
  await repo.setFormularioCapa(toId, {
    container,
    blob: blobName,
    nome: capa.nome || downloaded.filename || 'capa',
  });
}

async function clonarFormulario(req) {
  const id = parseId(req.params.id);
  const origem = await repo.findFormularioById(id);
  if (!origem) throw httpError(404, 'Formulário não encontrado.');
  if (origem.criadorId !== req.user.id && !isAdminPesquisas(req)) {
    throw httpError(403, 'Você não pode clonar este formulário.');
  }
  const perguntas = await repo.listPerguntas(id);
  const slug = await uniquePublicToken();
  const novoId = await repo.insertFormulario({
    criadorId: req.user.id,
    titulo: tituloCopia(origem.titulo),
    descricao: origem.descricao,
    categoria: origem.categoria || 'Sem categoria',
    prazo: origem.prazo,
    prazoInicio: toSqlDateTime(origem.prazoInicio),
    prazoFim: toSqlDateTime(origem.prazoFim),
    publicoAlvo: origem.publicoAlvo,
    publicoDepartamento: origem.publicoDepartamento,
    tipo: origem.tipo || 'avancado',
    status: 'rascunho',
    secoes: origem.secoes,
    logicaCondicional: origem.logicaCondicional,
    anonimo: origem.anonimo,
    slug,
    eventoTipo: origem.eventoTipo,
    eventoTipoOutro: origem.eventoTipoOutro,
    eventoAtivo: true,
    exigirIdentidade: origem.exigirIdentidade,
    templateCodigo: origem.templateCodigo,
    capaLayout: origem.capaLayout,
  });
  await repo.replacePerguntas(novoId, perguntas);
  await repo.copyFormularioBase(id, novoId);
  await repo.copyConvidados(id, novoId);
  await repo.copyDestinatarios(id, novoId);
  try {
    await copiarCapaFormulario(id, novoId);
  } catch {
    /* rascunho válido mesmo se a capa não puder ser copiada */
  }
  return getFormularioPorId(novoId, { includeConvidados: true });
}

async function salvarFormulario(req, { publicar }) {
  const body = normalizeFormBody(
    { ...req.body, _allowEmptyTitle: !publicar, _allowEmptyPerguntas: !publicar },
    { criadorId: req.user.id }
  );
  body.templateCodigo = await resolveTemplateCodigo(req.body?.templateCodigo);
  if (publicar && !body.perguntas.some(isBlocoPergunta)) {
    throw httpError(400, 'Inclua ao menos uma pergunta antes de publicar.');
  }
  const status = publicar ? 'publicado' : 'rascunho';
  const idParam = req.params.id ? parseId(req.params.id) : null;
  const guests = await resolveConvidadosFromBody(req.body, idParam);
  const usuarioIds = await resolveDestinatarioIds(req.body, body.publicoAlvo);

  if (idParam) {
    const existing = await repo.findFormularioById(idParam);
    if (!existing) throw httpError(404, 'Formulário não encontrado.');
    if (existing.criadorId !== req.user.id && !isAdminPesquisas(req)) {
      throw httpError(403, 'Você não pode alterar este formulário.');
    }
    if ((existing.totalRespostas || 0) > 0) {
      throw httpError(409, 'Este formulário já possui respostas e não pode ser alterado.');
    }
    await repo.updateFormularioMeta(idParam, { ...body, status });
    await repo.replacePerguntas(idParam, body.perguntas);
    if (guests) {
      await repo.replaceConvidados(idParam, guests);
    } else if (body.publicoAlvo !== 'externos') {
      await repo.replaceConvidados(idParam, []);
    }
    await persistDestinatarios(idParam, body.publicoAlvo, usuarioIds, { publicar });
    if (!existing.slug) {
      await repo.setFormularioSlug(idParam, await uniquePublicToken());
    }
    if (publicar && body.publicoAlvo === 'externos') {
      const n = guests ? guests.length : await repo.countConvidados(idParam);
      if (!n) {
        throw httpError(400, 'Inclua ao menos um convidado para publicar o formulário externo.');
      }
    }
    if (body.publicoAlvo === 'externos') {
      await removerComunicadoFormulario(idParam);
    }
    await maybeReplaceBase(idParam, req.body, body.publicoAlvo);
    return getFormularioPorId(idParam, { includeConvidados: true });
  }

  const slug = await uniquePublicToken();
  const id = await repo.insertFormulario({ ...body, status, slug });
  await repo.replacePerguntas(id, body.perguntas);
  if (guests && guests.length) {
    await repo.replaceConvidados(id, guests);
  }
  await persistDestinatarios(id, body.publicoAlvo, usuarioIds, { publicar });
  if (publicar && body.publicoAlvo === 'externos' && !(guests && guests.length)) {
    throw httpError(400, 'Inclua ao menos um convidado para publicar o formulário externo.');
  }
  await maybeReplaceBase(id, req.body, body.publicoAlvo);
  return getFormularioPorId(id, { includeConvidados: true });
}

async function publicarFormulario(req) {
  const idParam = req.params.id ? parseId(req.params.id) : null;
  let form;
  if (idParam && !Array.isArray(req.body?.perguntas)) {
    const existing = await repo.findFormularioById(idParam);
    if (!existing) throw httpError(404, 'Formulário não encontrado.');
    if (existing.criadorId !== req.user.id && !isAdminPesquisas(req)) {
      throw httpError(403, 'Você não pode alterar este formulário.');
    }
    if (!existing.titulo || existing.titulo === 'Sem título') {
      throw httpError(400, 'Dê um título ao formulário antes de publicar.');
    }
    if (existing.publicoAlvo === 'externos') {
      const n = await repo.countConvidados(idParam);
      if (!n) {
        throw httpError(400, 'Inclua ao menos um convidado para publicar o formulário externo.');
      }
    }
    if (existing.publicoAlvo === 'personalizado') {
      const n = await repo.countDestinatarios(idParam);
      if (!n) {
        throw httpError(
          400,
          'Inclua ao menos um colaborador para publicar o formulário personalizado.'
        );
      }
    }
    if (!existing.slug) {
      await repo.setFormularioSlug(idParam, await uniquePublicToken());
    }
    await repo.setFormularioStatus(idParam, 'publicado');
    form = await getFormularioPorId(idParam, { includeConvidados: true });
  } else {
    form = await salvarFormulario(req, { publicar: true });
  }
  if (form.publicoAlvo === 'externos') {
    if (!(form.totalConvidados || (form.convidados && form.convidados.length))) {
      throw httpError(400, 'Inclua ao menos um convidado para publicar o formulário externo.');
    }
    await removerComunicadoFormulario(form.id);
  } else {
    await atualizarComunicadoDoFormulario(form, req.user.id);
  }
  return form;
}

async function despublicarFormulario(req) {
  const id = parseId(req.params.id);
  const existing = await repo.findFormularioById(id);
  if (!existing) throw httpError(404, 'Formulário não encontrado.');
  if (existing.criadorId !== req.user.id && !isAdminPesquisas(req)) {
    throw httpError(403, 'Você não pode alterar este formulário.');
  }
  await repo.setFormularioStatus(id, 'rascunho');
  await desativarComunicadoFormulario(id);
  return getFormularioPorId(id);
}

async function salvarRascunho(req) {
  return salvarFormulario(req, { publicar: false });
}

async function encerrarFormulario(req) {
  const id = parseId(req.params.id);
  const form = await repo.findFormularioById(id);
  if (!form) throw httpError(404, 'Formulário não encontrado.');
  if (form.criadorId !== req.user.id && !isAdminPesquisas(req)) {
    throw httpError(403, 'Você não pode encerrar este formulário.');
  }
  await repo.setFormularioStatus(id, 'encerrado');
  await desativarComunicadoFormulario(id);
  return getFormularioPorId(id);
}

async function excluirFormulario(req) {
  const id = parseId(req.params.id);
  const form = await repo.findFormularioById(id);
  if (!form) throw httpError(404, 'Formulário não encontrado.');
  const admin = isAdminPesquisas(req);
  if (form.criadorId !== req.user.id && !admin) {
    throw httpError(403, 'Você não pode excluir este formulário.');
  }
  await removerComunicadoFormulario(id);
  const capa = await repo.findFormularioCapa(id);
  await repo.deleteFormulario(id);
  if (capa) {
    try {
      await blobService.removerBlob(capa.container, capa.blob);
    } catch {
      /* ignore */
    }
  }
  return { ok: true };
}

async function payloadResponder(req) {
  const id = parseId(req.params.id);
  const form = await repo.findFormularioById(id);
  if (!form) throw httpError(404, 'Formulário não encontrado.');
  if (form.status !== 'publicado') {
    throw httpError(409, 'Este formulário não está aberto para respostas.');
  }
  if (!form.eventoAtivo) {
    throw httpError(409, 'Este formulário está desativado.');
  }
  if (form.publicoAlvo === 'externos') {
    throw httpError(403, 'Este formulário é para convidados externos. Use o link público.');
  }
  assertJanelaAberta(form);
  await assertElegivelIntranet(form, req.user);
  const ja = await repo.findRespostaDoUsuario(id, req.user.id);
  if (ja) throw httpError(409, 'Você já respondeu este formulário.');
  const perguntas = await repo.listPerguntas(id);
  const visual = await decorateForm(form);
  return {
    id: form.id,
    titulo: form.titulo,
    descricao: form.descricao,
    categoria: form.categoria,
    prazo: form.prazo,
    prazoInicio: form.prazoInicio || null,
    prazoFim: form.prazoFim || null,
    anonimo: form.anonimo,
    secoes: form.secoes,
    logicaCondicional: form.logicaCondicional,
    perguntas,
    template: visual.template,
    capaUrl: visual.capaUrl,
    capaLayout: form.capaLayout || 'top',
    temBase: false,
  };
}

async function lookupBaseIntranet(req) {
  const id = parseId(req.params.id);
  const form = await repo.findFormularioById(id);
  if (!form) throw httpError(404, 'Formulário não encontrado.');
  if (form.status !== 'publicado') {
    throw httpError(409, 'Este formulário não está aberto para respostas.');
  }
  if (!form.eventoAtivo) {
    throw httpError(409, 'Este formulário está desativado.');
  }
  if (form.publicoAlvo === 'externos') {
    throw httpError(403, 'Este formulário é para convidados externos. Use o link público.');
  }
  assertJanelaAberta(form);
  await assertElegivelIntranet(form, req.user);
  return { campos: {} };
}

function parseItensBody(req) {
  let raw = req.body?.itens;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = [];
    }
  }
  return Array.isArray(raw) ? raw : [];
}

function parseAnexoValor(valor) {
  if (!valor) return null;
  if (typeof valor === 'object' && valor.nome && valor.container && valor.blob) return valor;
  try {
    const o = JSON.parse(String(valor));
    if (o && o.nome && o.container && o.blob) return o;
  } catch {
    /* ignore */
  }
  return null;
}

function rotuloAnexoValor(valor) {
  const meta = parseAnexoValor(valor);
  return meta ? meta.nome : valor || '';
}

async function processarAnexosResposta(req, perguntas) {
  const files = Array.isArray(req.files) ? req.files : [];
  const byPergunta = new Map();
  for (const f of files) {
    const m = String(f.fieldname || '').match(/^anexo_(\d+)$/);
    if (!m) continue;
    byPergunta.set(Number(m[1]), f);
  }
  if (!byPergunta.size) return new Map();

  const container = await blobService.garantirContainer(env.pesquisasContainer);
  const uploaded = new Map();
  for (const [perguntaId, file] of byPergunta) {
    const pergunta = perguntas.find((p) => p.id === perguntaId && p.blocoTipo === 'anexo');
    if (!pergunta) {
      try {
        fs.unlinkSync(file.path);
      } catch {
        /* ignore */
      }
      continue;
    }
    const blobName = blobService.novoBlobName(file.originalname);
    try {
      await blobService.enviarArquivo(container, file.path, blobName, file.mimetype);
      uploaded.set(
        perguntaId,
        JSON.stringify({
          nome: file.originalname,
          container,
          blob: blobName,
        })
      );
    } finally {
      try {
        fs.unlinkSync(file.path);
      } catch {
        /* ignore */
      }
    }
  }
  return uploaded;
}

function montarItensResposta(perguntas, rawItens, anexosPorPergunta = new Map()) {
  const byPergunta = new Map();
  for (const item of Array.isArray(rawItens) ? rawItens : []) {
    const perguntaId = Number(item.perguntaId);
    if (!perguntaId) continue;
    byPergunta.set(perguntaId, item.valor == null ? '' : String(item.valor).trim());
  }
  for (const [perguntaId, valor] of anexosPorPergunta) {
    byPergunta.set(perguntaId, valor);
  }

  const visiveis = perguntas.filter(
    (p) => p.blocoTipo !== 'texto' && perguntaVisivel(p, perguntas, byPergunta)
  );
  const itens = [];
  for (const p of visiveis) {
    const valor = byPergunta.get(p.id) ?? '';
    if (p.obrigatoria && !valor) {
      throw httpError(400, `Responda a pergunta: ${p.texto}`);
    }
    if (p.blocoTipo === 'anexo') {
      if (valor && !parseAnexoValor(valor)) {
        throw httpError(400, `Anexe um arquivo em: ${p.texto}`);
      }
      itens.push({ perguntaId: p.id, valor });
      continue;
    }
    if (p.tipo === 'escala' && valor) {
      const n = Number(valor);
      if (!Number.isInteger(n) || n < 1 || n > 10) {
        throw httpError(400, 'A escala deve ser um número de 1 a 10.');
      }
    }
    if (p.tipo === 'sim_nao' && valor && valor !== 'Sim' && valor !== 'Não') {
      throw httpError(400, 'Resposta Sim/Não inválida.');
    }
    if (p.tipo === 'multipla_escolha' && valor && !(p.opcoes || []).includes(valor)) {
      throw httpError(400, 'Opção inválida.');
    }
    itens.push({ perguntaId: p.id, valor });
  }
  return itens;
}

async function enviarResposta(req) {
  const payload = await payloadResponder(req);
  const anexos = await processarAnexosResposta(req, payload.perguntas);
  const itens = montarItensResposta(payload.perguntas, parseItensBody(req), anexos);
  try {
    await repo.insertResposta(payload.id, req.user.id, itens);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      throw httpError(409, 'Você já respondeu este formulário.');
    }
    throw err;
  }
  return { ok: true };
}

async function findFormularioByRef(raw) {
  const s = String(raw ?? '').trim();
  if (/^\d+$/.test(s)) {
    const id = Number(s);
    if (Number.isInteger(id) && id >= 1) {
      const byId = await repo.findFormularioById(id);
      if (byId) return byId;
    }
    if (s.length < 8) {
      throw httpError(404, 'Formulário não encontrado.');
    }
  }
  const slug = parseSlug(s);
  const form = await repo.findFormularioBySlug(slug);
  if (!form) throw httpError(404, 'Formulário não encontrado.');
  return form;
}

async function resultados(req) {
  const form = await findFormularioByRef(req.params.id);
  if (form.criadorId !== req.user.id && !isAdminPesquisas(req)) {
    throw httpError(403, 'Você não pode ver os resultados deste formulário.');
  }
  const id = form.id;
  const perguntas = await repo.listPerguntas(id);
  const respostas = await repo.listRespostasDetalhadas(id);
  const convidados = form.publicoAlvo === 'externos' ? await repo.listConvidados(id) : [];
  const destinatarios =
    form.publicoAlvo === 'personalizado' ? await repo.listDestinatarios(id) : [];

  const perguntasOut = [];
  for (const p of perguntas) {
    if (p.blocoTipo === 'texto') continue;
    const valores = [];
    for (const r of respostas) {
      const item = r.itens.find((i) => i.perguntaId === p.id);
      if (!item || item.valor == null || item.valor === '') continue;
      const anexo = p.blocoTipo === 'anexo' ? parseAnexoValor(item.valor) : null;
      let anexoUrl = null;
      if (anexo) {
        try {
          const sas = await blobService.gerarSasLeitura(anexo.container, anexo.blob, {
            downloadNome: anexo.nome,
          });
          anexoUrl = sas.url;
        } catch {
          anexoUrl = null;
        }
      }
      valores.push({
        valor: anexo ? anexo.nome : item.valor,
        anexoUrl,
        respostaId: r.id,
        respondente: form.anonimo
          ? null
          : { nome: r.nome, email: r.email, departamento: r.departamento || '' },
        enviadoEm: r.enviadoEm,
      });
    }
    const agregados = {};
    if (p.tipo === 'sim_nao' || p.tipo === 'escala' || p.tipo === 'multipla_escolha') {
      const counts = {};
      for (const v of valores) {
        counts[v.valor] = (counts[v.valor] || 0) + 1;
      }
      agregados.opcoes = Object.entries(counts).map(([valor, count]) => ({ valor, count }));
      if (p.tipo === 'escala') {
        const nums = valores.map((v) => Number(v.valor)).filter((n) => n >= 1 && n <= 10);
        const soma = nums.reduce((a, b) => a + b, 0);
        agregados.media = nums.length ? Math.round((soma / nums.length) * 10) / 10 : 0;
        agregados.dist = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => counts[String(n)] || 0);
      }
    }
    perguntasOut.push({ ...p, total: valores.length, agregados, respostas: valores });
  }

  const publicoAlvoTotal =
    form.publicoAlvo === 'externos'
      ? form.totalConvidados || 0
      : form.publicoAlvo === 'personalizado'
        ? form.totalDestinatarios || (await repo.countDestinatarios(id))
        : form.publicoAlvo === 'departamento' && form.publicoDepartamento
          ? await repo.countUsuariosAtivos(form.publicoDepartamento)
          : await repo.countUsuariosAtivos();
  const pendentes = Math.max(publicoAlvoTotal - respostas.length, 0);
  const taxa = publicoAlvoTotal ? Math.round((100 * respostas.length) / publicoAlvoTotal) : 0;
  const series = await repo.seriesRespostasDiarias(id, 7);

  return {
    formulario: await decorateForm({ ...form, convidados, destinatarios }),
    total: respostas.length,
    perguntas: perguntasOut,
    publicoAlvoTotal,
    pendentes,
    taxa,
    dailySeries: buildDailySeries(series.byDay, series.dias),
    respondentes: form.anonimo
      ? []
      : respostas.map((r) => ({
          name: r.nome,
          dept: r.departamento || '—',
          date: formatBrDateTime(r.enviadoEm) || '',
        })),
  };
}

async function adicionarConvidado(req) {
  const form = await findFormularioByRef(req.params.id);
  if (form.criadorId !== req.user.id && !isAdminPesquisas(req)) {
    throw httpError(403, 'Você não pode alterar este formulário.');
  }
  if (form.publicoAlvo !== 'externos') {
    throw httpError(400, 'Só formulários para convidados externos aceitam esta lista.');
  }
  const guests = await normalizeConvidados([req.body], form.id);
  if (!guests.length) {
    throw httpError(400, 'Informe os dados do convidado.');
  }
  const guest = guests[0];
  const duplicado = await repo.findConvidadoByCpfHash(form.id, guest.cpfHash);
  if (duplicado) {
    throw httpError(409, 'Este CPF ou CNPJ já está na lista.');
  }
  return repo.insertConvidado(form.id, guest);
}

function buildDailySeries(byDay, dias) {
  const out = [];
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  for (let i = dias - 1; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    out.push({
      label: WEEKDAYS[d.getDay()],
      value: byDay.get(key) || 0,
    });
  }
  return out;
}

async function minhaResposta(req) {
  const id = parseId(req.params.id);
  const form = await repo.findFormularioById(id);
  if (!form) throw httpError(404, 'Formulário não encontrado.');
  const resp = await repo.findRespostaDoUsuario(id, req.user.id);
  if (!resp) throw httpError(404, 'Você ainda não respondeu este formulário.');
  const itens = await repo.listRespostaItens(resp.id);
  return {
    title: form.titulo,
    sub: resp.enviadoEm ? `Respondido em ${formatBrDateTime(resp.enviadoEm)}` : 'Respondido',
    answers: itens.map((i) => ({ q: i.texto, a: rotuloAnexoValor(i.valor) || '—' })),
  };
}

async function listRequisicoes(req) {
  const lista = String(req.query.lista || '');
  if (!REQ_LISTAS.includes(lista)) {
    throw httpError(400, 'Lista de requisições inválida.');
  }
  const q = str(req.query.q, 120).toLowerCase();
  const statusFilter = str(req.query.status, 20);
  let rows = [];
  if (lista === 'req-pending') rows = await repo.listRequisicoesPendentes(req.user.id);
  else if (lista === 'req-answered') rows = await repo.listRequisicoesRespondidas(req.user.id);
  else rows = await repo.listRequisicoesCriadas(req.user.id);

  return rows
    .map((r) => toReqListItem(r, lista))
    .filter((it) => matchQuery(it, q))
    .filter((it) => !statusFilter || statusFilter === 'all' || it.status === statusFilter);
}

async function getRequisicao(req) {
  const id = parseId(req.params.id);
  const rec = await repo.findRequisicaoById(id);
  if (!rec) throw httpError(404, 'Requisição não encontrada.');
  const allowed =
    rec.criadorId === req.user.id ||
    rec.aprovadorUsuarioId === req.user.id ||
    isAdminPesquisas(req);
  if (!allowed) throw httpError(403, 'Você não pode ver esta requisição.');
  return rec;
}

async function criarRequisicao(req) {
  const body = req.body || {};
  const titulo = str(body.titulo, 255);
  if (!titulo) throw httpError(400, 'Informe o título da requisição.');
  const tipo = REQ_TIPOS.includes(body.tipo) ? body.tipo : null;
  if (!tipo) throw httpError(400, 'Selecione o tipo de requisição.');
  const prioridade = PRIORIDADES.includes(body.prioridade) ? body.prioridade : 'media';
  const aprovadorUsuarioId = parseId(body.aprovadorUsuarioId);
  const aprovador = await usersRepo.findById(aprovadorUsuarioId);
  if (!aprovador || !aprovador.ativo) {
    throw httpError(400, 'Aprovador inválido ou inativo.');
  }
  const aprovadorRotulo = APROVADOR_ROTULOS.includes(body.aprovadorRotulo)
    ? body.aprovadorRotulo
    : 'Gestor direto';

  let anexo = { container: null, blob: null, nome: null };
  if (req.file) {
    const container = await blobService.garantirContainer(env.pesquisasContainer);
    const blobName = blobService.novoBlobName(req.file.originalname);
    try {
      await blobService.enviarArquivo(container, req.file.path, blobName, req.file.mimetype);
    } finally {
      try {
        fs.unlinkSync(req.file.path);
      } catch {
        /* ignore */
      }
    }
    anexo = { container, blob: blobName, nome: req.file.originalname };
  }

  const id = await repo.insertRequisicao({
    criadorId: req.user.id,
    tipo,
    titulo,
    descricao: str(body.descricao, 4000),
    prioridade,
    prazo: parseDate(body.prazo),
    aprovadorUsuarioId,
    aprovadorRotulo,
    observacoes: str(body.observacoes, 500),
    anexoContainer: anexo.container,
    anexoBlob: anexo.blob,
    anexoNome: anexo.nome,
    status: 'pendente',
  });
  return repo.findRequisicaoById(id);
}

async function decidirRequisicao(req) {
  const id = parseId(req.params.id);
  const rec = await repo.findRequisicaoById(id);
  if (!rec) throw httpError(404, 'Requisição não encontrada.');
  if (rec.aprovadorUsuarioId !== req.user.id && !isAdminPesquisas(req)) {
    throw httpError(403, 'Somente o aprovador pode decidir esta requisição.');
  }
  if (rec.status !== 'pendente' && rec.status !== 'em_andamento') {
    throw httpError(409, 'Esta requisição já foi decidida.');
  }
  const acao = str(req.body?.acao, 20);
  if (acao !== 'aprovar' && acao !== 'rejeitar') {
    throw httpError(400, 'Informe a ação: aprovar ou rejeitar.');
  }
  await repo.decidirRequisicao(id, acao === 'aprovar' ? 'concluida' : 'rejeitada');
  return repo.findRequisicaoById(id);
}

async function anexoRequisicao(req) {
  const rec = await getRequisicao(req);
  const anexo = await repo.findRequisicaoAnexo(rec.id);
  if (!anexo) throw httpError(404, 'Esta requisição não possui anexo.');
  return blobService.gerarSasLeitura(anexo.container, anexo.blob);
}

async function excluirRequisicao(req) {
  const id = parseId(req.params.id);
  const rec = await repo.findRequisicaoById(id);
  if (!rec) throw httpError(404, 'Requisição não encontrada.');
  const admin = isAdminPesquisas(req);
  if (rec.criadorId !== req.user.id && !admin) {
    throw httpError(403, 'Você não pode excluir esta requisição.');
  }
  if (!admin && rec.status !== 'rascunho') {
    throw httpError(409, 'Só é possível excluir rascunhos.');
  }
  const anexo = await repo.findRequisicaoAnexo(id);
  await repo.deleteRequisicao(id);
  if (anexo) {
    try {
      await blobService.removerBlob(anexo.container, anexo.blob);
    } catch {
      /* ignore */
    }
  }
  return { ok: true };
}

async function listAdminFormularios(req) {
  if (!isAdminPesquisas(req)) throw httpError(403, 'Acesso negado.');
  const q = str(req.query.q, 120).toLowerCase();
  const rows = await repo.listFormulariosAdmin();
  return rows
    .map((f) => ({
      ...toFormListItem(f, 'form-created'),
      criadorNome: f.criadorNome,
      prazo: f.prazo,
      criadoEm: f.criadoEm,
    }))
    .filter((it) => matchQuery(it, q) || (it.criadorNome || '').toLowerCase().includes(q));
}

async function listAdminRequisicoes(req) {
  if (!isAdminPesquisas(req)) throw httpError(403, 'Acesso negado.');
  const q = str(req.query.q, 120).toLowerCase();
  const rows = await repo.listRequisicoesAdmin();
  return rows
    .map((r) => ({
      ...toReqListItem(r, 'req-created'),
      criadorNome: r.criadorNome,
      aprovadorNome: r.aprovadorNome,
      criadoEm: r.criadoEm,
    }))
    .filter(
      (it) =>
        matchQuery(it, q) ||
        (it.criadorNome || '').toLowerCase().includes(q) ||
        (it.aprovadorNome || '').toLowerCase().includes(q)
    );
}

async function buscarAprovadores(req) {
  const q = str(req.query.q, 80);
  if (q.length < 2) return [];
  return repo.buscarAprovadores(q);
}

async function departamentos() {
  return repo.listDepartamentos();
}

async function listDestinatariosCandidatos() {
  return repo.listDestinatariosCandidatos();
}

function parseSlug(raw) {
  const slug = str(raw, 80);
  if (!slug || !/^[A-Za-z0-9][A-Za-z0-9_-]{7,79}$/.test(slug)) {
    throw httpError(400, 'Link inválido.');
  }
  return slug;
}

function assertFormularioPublicoAberto(form) {
  if (!form || form.publicoAlvo !== 'externos') {
    throw httpError(404, 'Formulário não encontrado.');
  }
  if (form.status !== 'publicado') {
    throw httpError(409, 'Este formulário não está aberto para respostas.');
  }
  if (!form.eventoAtivo) {
    throw httpError(409, 'Este evento está desativado.');
  }
  assertJanelaAberta(form);
}

async function publicoMeta(req) {
  const slug = parseSlug(req.params.slug);
  const form = await repo.findFormularioBySlug(slug);
  if (!form || form.publicoAlvo !== 'externos') {
    throw httpError(404, 'Formulário não encontrado.');
  }
  const visual = await decorateForm(form);
  return {
    slug: form.slug,
    titulo: form.titulo,
    descricao: form.descricao,
    status: form.status,
    eventoAtivo: form.eventoAtivo,
    exigirIdentidade: form.exigirIdentidade,
    eventoTipo: form.eventoTipo,
    eventoTipoOutro: form.eventoTipoOutro,
    prazoInicio: form.prazoInicio || null,
    prazoFim: form.prazoFim || null,
    template: visual.template,
    capaUrl: visual.capaUrl,
    capaLayout: form.capaLayout || 'top',
  };
}

function parseIdentidadeBody(body) {
  const valor = str(body?.valor, 200);
  const cpfRaw = str(body?.cpf, 32);
  const emailRaw = str(body?.email, 200).toLowerCase();
  let doc = digitsCpf(valor || cpfRaw);
  let email = '';
  if (valor.includes('@') && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor.toLowerCase())) {
    email = valor.toLowerCase();
    doc = '';
  } else if (emailRaw && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw)) {
    email = emailRaw;
  }
  const hasDoc = isDocumentoValido(doc);
  if (!hasDoc && !email) {
    throw httpError(400, 'Informe um CPF (11 dígitos), CNPJ (14 dígitos) ou o e-mail cadastrado.');
  }
  return {
    cpfHash: hasDoc ? cryptoService.hmacSha256(doc) : null,
    email: email || null,
  };
}

function guestIdentidades(guest) {
  const hashes = guest?.cpfHashes || (guest?.cpfHash ? [guest.cpfHash] : []);
  const emails = guest?.emails || (guest?.email ? [guest.email] : []);
  return { cpfHashes: hashes, emails };
}

function tokenIdentidade(identity) {
  const hashes = identity.cpfHashes || (identity.cpfHash ? [identity.cpfHash] : []);
  const emails = identity.emails || (identity.email ? [identity.email] : []);
  const payload = {};
  if (hashes[0]) payload.cpfHash = hashes[0];
  if (emails[0]) payload.email = emails[0];
  if (hashes.length) payload.cpfHashes = hashes.slice(0, 20);
  if (emails.length) payload.emails = emails.slice(0, 20);
  return payload;
}

async function resolveGuestDoForm(form, guest) {
  if (!guest) {
    throw httpError(401, 'Confirme sua identidade para continuar.');
  }
  const ids = guestIdentidades(guest);
  const row = await repo.findConvidadoByIdentidade(form.id, ids.cpfHashes, ids.emails);
  if (!row) {
    throw httpError(401, 'Confirme sua identidade para continuar.');
  }
  return row;
}

function itemPortal(row) {
  return {
    slug: row.slug,
    titulo: row.titulo,
    descricao: row.descricao || '',
    marca: marcaRotulo(row.templateCodigo),
    prazoFim: row.prazoFim || null,
    respondidoEm: row.respondidoEm || null,
  };
}

function marcaRotulo(codigo) {
  const id = String(codigo || '').trim().toLowerCase();
  if (id === 'nubank') return 'Nubank Parque';
  if (id === 'wtorre') return 'WTorre';
  return '';
}

async function verificarIdentidade(body) {
  const identity = parseIdentidadeBody(body);
  const expanded = await repo.expandIdentidades(
    identity.cpfHash ? [identity.cpfHash] : [],
    identity.email ? [identity.email] : []
  );
  const convites = await repo.findConvidadosByIdentidade(expanded.cpfHashes, expanded.emails);
  if (!convites.length) {
    throw httpError(401, 'CPF, CNPJ ou e-mail não conferem.');
  }
  const comNome = convites.find((c) => c.nome) || convites[0];
  const token = jwtService.signPesquisasGuest(tokenIdentidade(expanded));
  return { token, nome: comNome.nome || null };
}

async function montarPortal(guest) {
  if (!guest) {
    throw httpError(401, 'Confirme sua identidade para continuar.');
  }
  const ids = guestIdentidades(guest);
  const convites = await repo.findConvidadosByIdentidade(ids.cpfHashes, ids.emails);
  if (!convites.length) {
    throw httpError(401, 'CPF, CNPJ ou e-mail não conferem.');
  }
  const porSlug = new Map();
  let nome = '';
  for (const row of convites) {
    if (row.nome && !nome) nome = row.nome;
    if (!row.slug) continue;
    const prev = porSlug.get(row.slug);
    if (!prev || (row.respondidoEm && !prev.respondidoEm)) {
      porSlug.set(row.slug, row);
    }
  }
  const pendentes = [];
  const respondidas = [];
  for (const row of porSlug.values()) {
    if (row.respondidoEm) {
      respondidas.push(itemPortal(row));
      continue;
    }
    if (row.status === 'publicado' && row.eventoAtivo && !janelaFora(row)) {
      pendentes.push(itemPortal(row));
    }
  }
  return { nome: nome || null, pendentes, respondidas };
}

async function publicoHubMeta() {
  const template = await resolveTemplate('wtorre');
  return {
    hub: true,
    slug: '',
    titulo: 'Portal do Convidado',
    descricao: '',
    status: 'publicado',
    eventoAtivo: true,
    exigirIdentidade: true,
    eventoTipo: null,
    eventoTipoOutro: null,
    prazoInicio: null,
    prazoFim: null,
    template,
    capaUrl: null,
    capaLayout: 'top',
  };
}

async function publicoHubVerificar(req) {
  return verificarIdentidade(req.body);
}

async function publicoHubMinhas(req) {
  return montarPortal(req.guest);
}

async function publicoVerificar(req) {
  const slug = parseSlug(req.params.slug);
  const form = await repo.findFormularioBySlug(slug);
  if (!form || form.publicoAlvo !== 'externos') {
    throw httpError(404, 'Formulário não encontrado.');
  }
  return verificarIdentidade(req.body);
}

async function publicoMinhas(req) {
  const slug = parseSlug(req.params.slug);
  const form = await repo.findFormularioBySlug(slug);
  if (!form || form.publicoAlvo !== 'externos') {
    throw httpError(404, 'Formulário não encontrado.');
  }
  return montarPortal(req.guest);
}

async function publicoFormulario(req) {
  const slug = parseSlug(req.params.slug);
  const form = await repo.findFormularioBySlug(slug);
  assertFormularioPublicoAberto(form);
  if (form.exigirIdentidade) {
    const guest = await resolveGuestDoForm(form, req.guest);
    const ja = await repo.findRespostaDoConvidado(form.id, guest.id);
    if (ja) throw httpError(409, 'Você já respondeu este formulário.');
  }
  const perguntas = await repo.listPerguntas(form.id);
  const visual = await decorateForm(form);
  return {
    id: form.id,
    slug: form.slug,
    titulo: form.titulo,
    descricao: form.descricao,
    categoria: form.categoria,
    prazo: form.prazo,
    prazoInicio: form.prazoInicio || null,
    prazoFim: form.prazoFim || null,
    anonimo: form.anonimo,
    secoes: form.secoes,
    logicaCondicional: form.logicaCondicional,
    perguntas,
    template: visual.template,
    capaUrl: visual.capaUrl,
    capaLayout: form.capaLayout || 'top',
    temBase: (await baseResumo(form.id)).total > 0,
  };
}

async function lookupBasePublico(req) {
  const slug = parseSlug(req.params.slug);
  const form = await repo.findFormularioBySlug(slug);
  assertFormularioPublicoAberto(form);
  if (form.exigirIdentidade) {
    await resolveGuestDoForm(form, req.guest);
  }
  const keys = lookupKeysFromValor(req.body?.valor);
  if (!keys.chaveDoc && !keys.chaveEmail) return { campos: {} };
  const dados = await repo.lookupFormularioBase(form.id, keys);
  return { campos: dados || {} };
}

async function publicoResponder(req) {
  const slug = parseSlug(req.params.slug);
  const form = await repo.findFormularioBySlug(slug);
  assertFormularioPublicoAberto(form);
  let convidadoId = null;
  if (form.exigirIdentidade) {
    const guest = await resolveGuestDoForm(form, req.guest);
    convidadoId = guest.id;
    const ja = await repo.findRespostaDoConvidado(form.id, convidadoId);
    if (ja) throw httpError(409, 'Você já respondeu este formulário.');
  }
  const perguntas = await repo.listPerguntas(form.id);
  const anexos = await processarAnexosResposta(req, perguntas);
  const itens = montarItensResposta(perguntas, parseItensBody(req), anexos);
  try {
    await repo.insertResposta(form.id, null, itens, convidadoId);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      throw httpError(409, 'Você já respondeu este formulário.');
    }
    throw err;
  }
  return { ok: true };
}

async function atualizarEvento(req) {
  const id = parseId(req.params.id);
  const form = await repo.findFormularioById(id);
  if (!form) throw httpError(404, 'Formulário não encontrado.');
  if (form.criadorId !== req.user.id && !isAdminPesquisas(req)) {
    throw httpError(403, 'Você não pode alterar este formulário.');
  }
  await repo.setEventoAtivo(id, req.body?.eventoAtivo !== false);
  const atualizado = await getFormularioPorId(id, { includeConvidados: true });
  await atualizarComunicadoDoFormulario(atualizado, req.user.id);
  return atualizado;
}

function hexColor(raw, fallback) {
  const s = str(raw, 7).toUpperCase();
  if (/^#[0-9A-F]{6}$/.test(s)) return s;
  if (fallback) return fallback;
  throw httpError(400, 'Informe uma cor hexadecimal no formato #RRGGBB.');
}

function normalizeTemplateBody(body, { requireCodigo }) {
  const nome = str(body.nome, 80);
  if (!nome) throw httpError(400, 'Informe o nome do template.');
  const wordmark = str(body.wordmark, 80).toUpperCase() || nome.toUpperCase();
  const corPrimaria = hexColor(body.corPrimaria);
  const corPrimariaEscura = hexColor(body.corPrimariaEscura, corPrimaria);
  const raioPx = Math.min(Math.max(Number(body.raioPx) || 10, 0), 40);
  const ordem = Math.min(Math.max(Number(body.ordem) || 0, 0), 999);
  const ativo = body.ativo !== false;
  const out = { nome, wordmark, corPrimaria, corPrimariaEscura, raioPx, ordem, ativo };
  if (requireCodigo) {
    const codigo = str(body.codigo, 40).toLowerCase();
    if (!codigo || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(codigo)) {
      throw httpError(400, 'Código inválido. Use letras minúsculas, números e hífen.');
    }
    out.codigo = codigo;
  }
  return out;
}

async function listTemplatesAtivos() {
  return repo.listTemplatesAtivos();
}

async function listAdminTemplates(req) {
  const q = str(req.query.q, 80).toLowerCase();
  const rows = await repo.listTemplates();
  if (!q) return rows;
  return rows.filter(
    (t) =>
      t.nome.toLowerCase().includes(q) ||
      t.codigo.toLowerCase().includes(q) ||
      t.wordmark.toLowerCase().includes(q)
  );
}

async function criarTemplate(req) {
  const body = normalizeTemplateBody(req.body, { requireCodigo: true });
  const existing = await repo.findTemplateByCodigo(body.codigo);
  if (existing) throw httpError(409, 'Já existe um template com este código.');
  const id = await repo.insertTemplate(body);
  return repo.findTemplateById(id);
}

async function atualizarTemplate(req) {
  const id = parseId(req.params.id);
  const existing = await repo.findTemplateById(id);
  if (!existing) throw httpError(404, 'Template não encontrado.');
  const body = normalizeTemplateBody(req.body, { requireCodigo: false });
  if (existing.codigo === 'wtorre' && body.ativo === false) {
    throw httpError(409, 'O template WTorre é o padrão e não pode ser desativado.');
  }
  await repo.updateTemplate(id, body);
  return repo.findTemplateById(id);
}

async function excluirTemplate(req) {
  const id = parseId(req.params.id);
  const existing = await repo.findTemplateById(id);
  if (!existing) throw httpError(404, 'Template não encontrado.');
  if (existing.codigo === 'wtorre') {
    throw httpError(409, 'O template WTorre não pode ser excluído.');
  }
  const n = await repo.countFormulariosPorTemplate(existing.codigo);
  if (n > 0) {
    throw httpError(409, 'Este template está em uso e não pode ser excluído.');
  }
  await repo.deleteTemplate(id);
  return { ok: true };
}

function assertPodeEditarForm(req, form) {
  if (!form) throw httpError(404, 'Formulário não encontrado.');
  if (form.criadorId !== req.user.id && !isAdminPesquisas(req)) {
    throw httpError(403, 'Você não pode alterar este formulário.');
  }
}

async function uploadCapa(req) {
  const id = parseId(req.params.id);
  const form = await repo.findFormularioById(id);
  assertPodeEditarForm(req, form);
  if (!req.file) throw httpError(400, 'Envie uma imagem de capa.');
  const anterior = await repo.findFormularioCapa(id);
  const container = await blobService.garantirContainer(env.pesquisasContainer);
  const blobName = blobService.novoBlobName(req.file.originalname);
  try {
    await blobService.enviarArquivo(container, req.file.path, blobName, req.file.mimetype);
  } finally {
    try {
      fs.unlinkSync(req.file.path);
    } catch {
      /* ignore */
    }
  }
  await repo.setFormularioCapa(id, {
    container,
    blob: blobName,
    nome: req.file.originalname,
  });
  if (anterior) {
    try {
      await blobService.removerBlob(anterior.container, anterior.blob);
    } catch {
      /* ignore */
    }
  }
  return getFormularioPorId(id, { includeConvidados: true });
}

async function removerCapa(req) {
  const id = parseId(req.params.id);
  const form = await repo.findFormularioById(id);
  assertPodeEditarForm(req, form);
  const anterior = await repo.findFormularioCapa(id);
  await repo.setFormularioCapa(id, null);
  if (anterior) {
    try {
      await blobService.removerBlob(anterior.container, anterior.blob);
    } catch {
      /* ignore */
    }
  }
  return getFormularioPorId(id, { includeConvidados: true });
}

const MAX_PORTAL_SLIDES = 20;

function parseAtivo(raw, fallback = true) {
  if (raw === undefined || raw === null || raw === '') return fallback;
  if (raw === true || raw === 1 || raw === '1' || raw === 'true') return true;
  if (raw === false || raw === 0 || raw === '0' || raw === 'false') return false;
  return fallback;
}

function unlinkTmp(file) {
  if (!file?.path) return;
  try {
    fs.unlinkSync(file.path);
  } catch {
    /* ignore */
  }
}

async function resolveSlideImagemUrl(slide) {
  if (slide.container && slide.blob) {
    try {
      const sas = await blobService.gerarSasLeitura(slide.container, slide.blob);
      return sas.url;
    } catch {
      return null;
    }
  }
  const url = String(slide.imagemUrl || '').trim();
  return url || null;
}

async function toAdminSlide(slide) {
  return {
    id: slide.id,
    ordem: slide.ordem,
    titulo: slide.titulo || '',
    imagemUrl: await resolveSlideImagemUrl(slide),
    temArquivo: !!(slide.container && slide.blob),
    ativo: slide.ativo,
  };
}

async function listAdminCarrossel(req) {
  const q = str(req.query.q, 80).toLowerCase();
  const rows = await repo.listPortalSlides();
  const mapped = [];
  for (const row of rows) {
    if (q && !(row.titulo || '').toLowerCase().includes(q)) continue;
    mapped.push(await toAdminSlide(row));
  }
  return mapped;
}

async function listPublicoCarrossel() {
  const rows = await repo.listPortalSlidesAtivos();
  const slides = [];
  for (const row of rows) {
    const imagemUrl = await resolveSlideImagemUrl(row);
    if (!imagemUrl) continue;
    slides.push({
      titulo: String(row.titulo || '').slice(0, 200),
      imagemUrl,
      dataTexto: '',
    });
  }
  return { slides };
}

async function uploadSlideBlob(file) {
  const container = await blobService.garantirContainer(env.pesquisasContainer);
  const blobName = blobService.novoBlobName(file.originalname);
  try {
    await blobService.enviarArquivo(container, file.path, blobName, file.mimetype);
  } finally {
    unlinkTmp(file);
  }
  return { container, blob: blobName, nome: file.originalname };
}

async function criarPortalSlide(req) {
  if (!req.file) throw httpError(400, 'Envie uma imagem JPEG, PNG ou WebP.');
  const n = await repo.countPortalSlides();
  if (n >= MAX_PORTAL_SLIDES) {
    throw httpError(409, 'Limite de 20 imagens no carrossel.');
  }
  const titulo = str(req.body?.titulo, 200);
  const ativo = parseAtivo(req.body?.ativo, true);
  const stored = await uploadSlideBlob(req.file);
  const ordem = await repo.nextPortalSlideOrdem();
  const id = await repo.insertPortalSlide({
    ordem,
    titulo: titulo || null,
    imagemUrl: null,
    container: stored.container,
    blob: stored.blob,
    nome: stored.nome,
    ativo,
  });
  return toAdminSlide(await repo.findPortalSlideById(id));
}

async function atualizarPortalSlide(req) {
  const id = parseId(req.params.id);
  const existing = await repo.findPortalSlideById(id);
  if (!existing) throw httpError(404, 'Imagem não encontrada.');
  const titulo = str(req.body?.titulo, 200);
  const ativo = parseAtivo(req.body?.ativo, existing.ativo);
  let stored = null;
  if (req.file) {
    stored = await uploadSlideBlob(req.file);
  }
  await repo.updatePortalSlide(id, {
    titulo: titulo || null,
    ativo,
    ...(stored
      ? {
          imagemUrl: null,
          container: stored.container,
          blob: stored.blob,
          nome: stored.nome,
        }
      : {}),
  });
  if (stored && existing.container && existing.blob) {
    try {
      await blobService.removerBlob(existing.container, existing.blob);
    } catch {
      /* ignore */
    }
  }
  return toAdminSlide(await repo.findPortalSlideById(id));
}

async function excluirPortalSlide(req) {
  const id = parseId(req.params.id);
  const existing = await repo.findPortalSlideById(id);
  if (!existing) throw httpError(404, 'Imagem não encontrada.');
  await repo.deletePortalSlide(id);
  if (existing.container && existing.blob) {
    try {
      await blobService.removerBlob(existing.container, existing.blob);
    } catch {
      /* ignore */
    }
  }
  return { ok: true };
}

async function moverPortalSlide(req) {
  const id = parseId(req.params.id);
  const direcao = str(req.body?.direcao, 8);
  if (direcao !== 'up' && direcao !== 'down') {
    throw httpError(400, 'Informe a direção up ou down.');
  }
  const existing = await repo.findPortalSlideById(id);
  if (!existing) throw httpError(404, 'Imagem não encontrada.');
  const vizinho = await repo.findPortalSlideNeighbor(existing.ordem, direcao);
  if (!vizinho) return toAdminSlide(existing);
  await repo.swapPortalSlideOrdem(existing.id, existing.ordem, vizinho.id, vizinho.ordem);
  return toAdminSlide(await repo.findPortalSlideById(id));
}

module.exports = {
  APROVADOR_ROTULOS,
  resumo,
  listFormularios,
  getFormulario,
  clonarFormulario,
  publicarFormulario,
  despublicarFormulario,
  salvarRascunho,
  encerrarFormulario,
  excluirFormulario,
  payloadResponder,
  lookupBaseIntranet,
  enviarResposta,
  resultados,
  adicionarConvidado,
  minhaResposta,
  listRequisicoes,
  getRequisicao,
  criarRequisicao,
  decidirRequisicao,
  anexoRequisicao,
  excluirRequisicao,
  listAdminFormularios,
  listAdminRequisicoes,
  buscarAprovadores,
  departamentos,
  listDestinatariosCandidatos,
  publicoMeta,
  publicoHubMeta,
  publicoVerificar,
  publicoHubVerificar,
  publicoMinhas,
  publicoHubMinhas,
  publicoFormulario,
  lookupBasePublico,
  publicoResponder,
  atualizarEvento,
  listTemplatesAtivos,
  listAdminTemplates,
  criarTemplate,
  atualizarTemplate,
  excluirTemplate,
  uploadCapa,
  removerCapa,
  sincronizarComunicadosJanela,
  listAdminCarrossel,
  listPublicoCarrossel,
  criarPortalSlide,
  atualizarPortalSlide,
  excluirPortalSlide,
  moverPortalSlide,
};
