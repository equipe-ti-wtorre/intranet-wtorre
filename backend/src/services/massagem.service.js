const crypto = require('crypto');
const repo = require('../repositories/massagem.repository');
const mail = require('./massagem-mail.service');
const { env } = require('../config/env');
const { encerrarEventoSeDevido, processarEncerramentosEventos } = require('./massagem-lembrete.service');
const {
  makeChave,
  parseChave,
  isPastSlot,
  horaFimSlot,
  isDentroDoHorario,
  isDentroDoHorarioFalta,
  FALTA_CARENCIA_MIN,
  GRACE_ENCERRAMENTO_MIN,
  userDisplayName,
  httpError,
  normalizeHora,
  normalizePausas,
  horarioSobrepoePausa,
  horaFimExclusivoPausa,
} = require('../utils/massagem.util');
const {
  CODIGOS: TEMPLATE_CODIGOS,
  NOMES: TEMPLATE_NOMES,
  PLACEHOLDERS_POR_CODIGO,
  isCodigoValido,
  amostraVars,
  renderTemplate,
} = require('../utils/massagem-email-template.util');

function hasMassagemModulo(req) {
  if (req.user?.perfil === 'ADMIN') return true;
  return (req.userModulos || []).includes('massagem');
}

function formatDataCurta(iso) {
  const [y, m, d] = String(iso || '').split('-').map(Number);
  if (![y, m, d].every((n) => Number.isFinite(n))) return iso || '';
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
}

function msgReservaUnica(reserva) {
  const onde = reserva.unidade || reserva.eventoNm || 'outro evento';
  const usadaNoDia = reserva.status === 'presente' || isPastSlot(reserva.data, reserva.hora);
  if (usadaNoDia) {
    return `Você já utilizou sua sessão neste dia em ${onde}. Só é permitido um horário por dia.`;
  }
  return `Você já possui uma reserva em ${onde} em ${formatDataCurta(reserva.data)} às ${reserva.hora}. Só é permitido um horário por dia.`;
}

function toMinhaReservaDto(reserva) {
  if (!reserva) return null;
  return {
    chave: makeChave(reserva.eventoId, reserva.data, reserva.hora),
    eventoId: reserva.eventoId,
    eventoNm: reserva.eventoNm || '',
    unidade: reserva.unidade || '',
    data: reserva.data,
    hora: reserva.hora,
    status: reserva.status || 'ok',
  };
}

async function getReservaQueBloqueia(email, data) {
  if (!data) return null;
  return repo.getReservaUsuarioNoDia(email, data);
}

/** Envia e-mail fora do caminho crítico da API (não atrasa a resposta HTTP). */
function scheduleMail(label, promise) {
  Promise.resolve(promise).catch((err) => {
    console.warn(`[massagem] mail background (${label}):`, err?.message || err);
  });
}

function ocupacaoEvento(evento, reservas) {
  const total = evento.horarios.length;
  const ocupados = evento.horarios.filter((h) => {
    const r = reservas.find((x) => x.hora === h);
    return !!r;
  }).length;
  const pct = total === 0 ? 0 : Math.round((ocupados / total) * 100);
  return { total, ocupados, disponiveis: total - ocupados, pct };
}

async function notificarFilaParaVaga(chave) {
  const parsed = parseChave(chave);
  if (!parsed) return { notificados: 0 };
  const list = await repo.listFilaByEvento(parsed.eventoId);
  if (!list.length) return { notificados: 0 };
  const evento = await repo.getEvento(parsed.eventoId);
  const payloadBase = {
    data: parsed.data,
    hora: parsed.hora,
    eventoId: parsed.eventoId,
    evento,
  };
  // Com lista de teste, um único envio (safeSend faz o fan-out) evita N×M duplicatas.
  const emailsTeste = await repo.getEmailsTeste();
  if (emailsTeste.length) {
    await mail.emailFilaVagaAberta(emailsTeste[0], {
      ...payloadBase,
      nome: list[0]?.nome || '',
    });
    return { notificados: list.length };
  }
  await Promise.all(
    list.map((f) =>
      mail.emailFilaVagaAberta(f.email, { ...payloadBase, nome: f.nome || '' })
    )
  );
  return { notificados: list.length };
}

async function enrichEventos(eventos, email) {
  const result = [];
  for (const e of eventos) {
    const reservas = await repo.listReservasByEvento(e.id);
    const naFila = email ? await repo.getFilaUsuario(email, e.id) : null;
    result.push({
      ...e,
      ocupacao: ocupacaoEvento(e, reservas),
      euNaFila: !!naFila,
    });
  }
  return result;
}

async function listEventos(req) {
  try {
    await processarEncerramentosEventos();
  } catch (err) {
    console.error('[massagem-encerramento]', err.message);
  }
  const all = req.query.all === '1' && hasMassagemModulo(req);
  const eventos = await repo.listEventos({ all });
  return enrichEventos(eventos, req.user?.email || '');
}

function nomeEmpresaNorm(nm) {
  return String(nm || '').trim().toLowerCase();
}

async function empresaDoTabletUser(tabletUser) {
  const id = Number(tabletUser?.empresaId);
  if (!Number.isFinite(id) || id <= 0) return null;
  return repo.getEmpresa(id);
}

async function assertEventoDaEmpresaTablet(evento, tabletUser) {
  if (!evento) throw httpError(404, 'Evento não encontrado');
  const empresa = await empresaDoTabletUser(tabletUser);
  if (!empresa) throw httpError(403, 'Usuário sem empresa vinculada.');
  if (nomeEmpresaNorm(evento.unidade) !== nomeEmpresaNorm(empresa.nm)) {
    throw httpError(403, 'Este evento não pertence à sua empresa.');
  }
}

/** Eventos ativos da empresa da conta Tablet (sem e-mail de colaborador). */
async function listEventosAtivos(tabletUser) {
  const empresa = await empresaDoTabletUser(tabletUser);
  if (!empresa) return [];
  try {
    await processarEncerramentosEventos();
  } catch (err) {
    console.error('[massagem-encerramento]', err.message);
  }
  const eventos = await repo.listEventos({ all: false });
  const nome = nomeEmpresaNorm(empresa.nm);
  const filtrados = eventos.filter((e) => nomeEmpresaNorm(e.unidade) === nome);
  return enrichEventos(filtrados, '');
}

function parseHorariosBody(horarios) {
  return Array.isArray(horarios)
    ? horarios.map((h) => String(h).trim()).filter(Boolean)
    : String(horarios || '')
        .split(',')
        .map((h) => h.trim())
        .filter(Boolean);
}

function agendaDoBody(body, { requiredHorarios = false, duracaoMinFallback } = {}) {
  const horarioInicio = body.horarioInicio !== undefined ? normalizeHora(body.horarioInicio) : undefined;
  const horarioFim = body.horarioFim !== undefined ? normalizeHora(body.horarioFim) : undefined;
  if (body.horarioInicio !== undefined && body.horarioInicio && !horarioInicio) {
    throw httpError(400, 'Horário de início inválido.');
  }
  if (body.horarioFim !== undefined && body.horarioFim && !horarioFim) {
    throw httpError(400, 'Horário de fim inválido.');
  }
  const duracaoMinBody =
    body.duracaoMin !== undefined ? Number(body.duracaoMin) || 50 : undefined;
  const duracaoMin = duracaoMinBody !== undefined ? duracaoMinBody : duracaoMinFallback;
  const pausas =
    body.pausas !== undefined
      ? normalizePausas(body.pausas, {
          inicio: horarioInicio || null,
          fim: horarioFim || null,
          duracaoMin,
        })
      : undefined;
  let horarios;
  if (body.horarios !== undefined) {
    horarios = parseHorariosBody(body.horarios);
  } else if (requiredHorarios) {
    throw httpError(400, 'Campos obrigatórios: nm, masso, local, unidade, data, horarios');
  }
  if (horarios && pausas) {
    const dur = duracaoMin || 50;
    for (const h of horarios) {
      if (horarioSobrepoePausa(h, dur, pausas)) {
        throw httpError(400, `O horário ${h} coincide com uma pausa.`);
      }
    }
  }
  return { horarioInicio, horarioFim, pausas, horarios, duracaoMin: duracaoMinBody };
}

function assertHorarioReservavel(evento, hora) {
  if (!evento.horarios.includes(hora)) {
    throw httpError(400, 'Horário não disponível neste evento');
  }
  if (horarioSobrepoePausa(hora, evento.duracaoMin, evento.pausas || [])) {
    throw httpError(400, 'Este horário cai em uma pausa');
  }
}

function slotPausa(eventoId, data, pausa, duracaoMin) {
  return {
    chave: `pausa:${eventoId}_${data}_${pausa.inicio}`,
    hora: pausa.inicio,
    horaFim: horaFimExclusivoPausa(pausa, duracaoMin),
    estado: 'pausa',
    nome: pausa.nome,
  };
}

async function createEvento(body) {
  const { nm, masso, local, unidade, data, status } = body || {};
  if (!nm || !masso || !local || !unidade || !data || !body.horarios) {
    throw httpError(400, 'Campos obrigatórios: nm, masso, local, unidade, data, horarios');
  }
  const agenda = agendaDoBody(body, { requiredHorarios: true });
  const evento = await repo.createEvento({
    nm: String(nm).trim(),
    masso: String(masso).trim(),
    local: String(local).trim(),
    unidade: String(unidade).trim(),
    data: String(data).slice(0, 10),
    horarios: agenda.horarios,
    status: status === 'ativo' ? 'ativo' : 'inativo',
    duracaoMin: agenda.duracaoMin || 50,
    pausas: agenda.pausas || [],
    horarioInicio: agenda.horarioInicio || null,
    horarioFim: agenda.horarioFim || null,
  });
  return { ...evento, ocupacao: ocupacaoEvento(evento, []) };
}

async function updateEvento(id, body) {
  const patch = { ...(body || {}) };
  const keys = Object.keys(patch);
  const soStatus = keys.length === 1 && patch.status !== undefined;
  if (!soStatus) {
    const atual = await repo.getEvento(id);
    if (!atual) throw httpError(404, 'Evento não encontrado');
    const agenda = agendaDoBody(patch, { duracaoMinFallback: atual.duracaoMin });
    const nextHorarios = agenda.horarios !== undefined ? agenda.horarios : atual.horarios;
    const nextPausas = agenda.pausas !== undefined ? agenda.pausas : atual.pausas || [];
    const nextDur = agenda.duracaoMin !== undefined ? agenda.duracaoMin : atual.duracaoMin;
    const nextInicio =
      patch.horarioInicio !== undefined ? agenda.horarioInicio || null : atual.horarioInicio;
    const nextFim = patch.horarioFim !== undefined ? agenda.horarioFim || null : atual.horarioFim;
    const pausasOk = normalizePausas(nextPausas, {
      inicio: nextInicio,
      fim: nextFim,
      duracaoMin: nextDur,
    });
    for (const h of nextHorarios) {
      if (horarioSobrepoePausa(h, nextDur, pausasOk)) {
        throw httpError(400, `O horário ${h} coincide com uma pausa.`);
      }
    }
    if (agenda.horarios !== undefined) patch.horarios = agenda.horarios;
    if (agenda.pausas !== undefined) patch.pausas = pausasOk;
    if (patch.horarioInicio !== undefined) patch.horarioInicio = nextInicio;
    if (patch.horarioFim !== undefined) patch.horarioFim = nextFim;
    if (patch.unidade !== undefined) patch.unidade = String(patch.unidade).trim();
    if (agenda.duracaoMin !== undefined) patch.duracaoMin = agenda.duracaoMin;
  }
  const evento = await repo.updateEvento(id, patch);
  if (!evento) throw httpError(404, 'Evento não encontrado');
  const reservas = await repo.listReservasByEvento(evento.id);
  return { ...evento, ocupacao: ocupacaoEvento(evento, reservas) };
}

async function removeEvento(id) {
  const ok = await repo.removeEvento(id);
  if (!ok) throw httpError(404, 'Evento não encontrado');
  return { ok: true };
}

async function destinosDasListas(evento) {
  const empresa = await repo.findEmpresaByNome(evento.unidade);
  if (!empresa) {
    return { destinos: [], empresa: null, lista: null, modo: 'sem_empresa' };
  }
  const listas = await repo.listListasByEmpresaId(empresa.id);
  const destinos = [];
  const seen = new Set();
  for (const lista of listas) {
    const itens = await repo.listListaItens(lista.id);
    for (const i of itens) {
      const key = String(i.email || '').trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      destinos.push({ email: i.email, nome: i.nome || '' });
    }
  }
  if (destinos.length) {
    return {
      destinos,
      empresa,
      lista: listas[0] || null,
      modo: 'lista',
    };
  }
  return { destinos: [], empresa, lista: null, modo: 'sem_destino' };
}

/** Lista da empresa → e-mails de teste → vazio. Nunca ADMIN nem e-mail de grupo. */
async function resolverDestinosListaOuTeste(evento) {
  const fromLista = await destinosDasListas(evento);
  if (fromLista.destinos.length) return fromLista;
  const emailsTeste = await repo.getEmailsTeste();
  if (emailsTeste.length) {
    return {
      destinos: emailsTeste.map((email) => ({ email, nome: '' })),
      empresa: fromLista.empresa,
      lista: null,
      modo: 'teste',
    };
  }
  return fromLista;
}

async function dispararEvento(id, body) {
  const evento = await repo.getEvento(id);
  if (!evento) throw httpError(404, 'Evento não encontrado');

  const codigo = String(body?.codigoTemplate || 'disparo_evento').trim();
  if (!isCodigoValido(codigo)) {
    throw httpError(400, `Código de template inválido. Use um de: ${TEMPLATE_CODIGOS.join(', ')}`);
  }
  if (codigo !== 'disparo_evento') {
    const template = await repo.findEmailTemplateByCodigo(codigo, { onlyAtivo: true });
    if (!template) {
      throw httpError(400, 'Template inativo ou inexistente.');
    }
  }

  const { destinos, lista, modo } = await resolverDestinosListaOuTeste(evento);
  if (!destinos.length) {
    const msg =
      modo === 'sem_empresa'
        ? 'Nenhuma empresa cadastrada com o nome desta sessão. Cadastre a empresa ou crie uma lista.'
        : 'Nenhum e-mail de destino: cadastre a lista da empresa na aba Listas.';
    throw httpError(400, msg);
  }

  await mail.assertMailConfigured();
  const modoTeste = modo === 'teste';

  void mail.enviarDisparoLista(destinos, evento, codigo, { modoTeste }).then((r) => {
    if (r.erros?.length) {
      console.warn('[massagem-disparo]', r.erros);
    }
  }).catch((err) => {
    console.warn('[massagem-disparo]', err.message);
  });

  return {
    ok: true,
    aceito: true,
    enviados: destinos.length,
    erros: [],
    destino: lista?.nome || (modoTeste ? 'e-mails de teste' : ''),
    totalDestinos: destinos.length,
    modo,
    codigoTemplate: codigo,
    mensagem: modoTeste
      ? `Envio iniciado (modo teste) para ${destinos.length} endereço(s).`
      : `Envio iniciado para ${destinos.length} destinatário(s).`,
  };
}

async function listSlots(req) {
  const { eventoId, data } = req.query;
  if (!eventoId || !data) throw httpError(400, 'eventoId e data são obrigatórios');
  const evento = await repo.getEvento(eventoId);
  if (!evento) throw httpError(404, 'Evento não encontrado');

  const user = req.user;
  const isStaff = hasMassagemModulo(req);
  const reservas = await repo.listReservasByEvento(eventoId);
  const minhaReserva = await getReservaQueBloqueia(user.email, data);
  const mesmaEvento = minhaReserva && String(minhaReserva.eventoId) === String(eventoId);
  const fila = await repo.listFilaByEvento(eventoId);
  const minhaFila = await repo.getFilaUsuario(user.email, eventoId);
  const naFilaIdx = fila.findIndex((f) => f.email.toLowerCase() === user.email.toLowerCase());

  const slots = evento.horarios.map((hora) => {
    const chave = makeChave(eventoId, data, hora);
    const reserva = reservas.find((r) => r.data === String(data).slice(0, 10) && r.hora === hora);
    const encerrado = isPastSlot(data, hora);
    let estado = 'disponivel';
    const ativa = !!reserva;

    if (encerrado && !ativa) estado = 'encerrado';
    else if (ativa) {
      estado = reserva.email.toLowerCase() === user.email.toLowerCase() ? 'minha' : 'ocupado';
    }

    const slot = { chave, hora, estado };
    if (isStaff && reserva) {
      slot.nome = reserva.nome;
      slot.email = reserva.email;
      slot.status = reserva.status;
    }
    if (estado === 'minha' && reserva) {
      slot.status = reserva.status;
      slot.observacao = reserva.observacao || '';
    }
    return slot;
  });

  const pausas = (evento.pausas || []).map((p) => slotPausa(eventoId, data, p, evento.duracaoMin));
  slots.push(...pausas);
  slots.sort((a, b) => String(a.hora).localeCompare(String(b.hora)));

  return {
    eventoId: String(eventoId),
    data: String(data).slice(0, 10),
    slots,
    naFila: naFilaIdx >= 0 ? naFilaIdx + 1 : null,
    filaTotal: fila.length,
    minhaFilaId: minhaFila?.id || null,
    minhaChave: mesmaEvento
      ? makeChave(minhaReserva.eventoId, minhaReserva.data, minhaReserva.hora)
      : null,
    jaTemReserva: !!minhaReserva,
    minhaReserva: toMinhaReservaDto(minhaReserva),
  };
}

async function createReserva(req) {
  const { eventoId, chave, observacao } = req.body || {};
  if (!eventoId || !chave) throw httpError(400, 'eventoId e chave são obrigatórios');
  const parsed = parseChave(chave);
  if (!parsed || String(parsed.eventoId) !== String(eventoId)) {
    throw httpError(400, 'Chave inválida');
  }
  const evento = await repo.getEvento(eventoId);
  if (!evento || evento.status !== 'ativo') throw httpError(400, 'Evento inválido');
  if (parsed.data !== evento.data) throw httpError(400, 'Data inválida para este evento');
  assertHorarioReservavel(evento, parsed.hora);
  if (isPastSlot(parsed.data, parsed.hora)) throw httpError(400, 'Horário já encerrado');

  const existing = await repo.getReservaBySlot(eventoId, parsed.data, parsed.hora);
  if (existing) throw httpError(409, 'Horário indisponível');

  const jaTem = await getReservaQueBloqueia(req.user.email, parsed.data);
  if (jaTem) {
    const mesmoSlot =
      String(jaTem.eventoId) === String(eventoId) &&
      jaTem.data === parsed.data &&
      jaTem.hora === parsed.hora;
    if (!mesmoSlot) throw httpError(400, msgReservaUnica(jaTem));
  }

  const reserva = await repo.upsertReserva({
    eventoId,
    data: parsed.data,
    hora: parsed.hora,
    userId: req.user.id,
    email: req.user.email,
    nome: userDisplayName(req.user),
    status: 'ok',
    observacao: observacao || '',
  });
  await repo.removeFilaByEventoEmail(req.user.email, eventoId);
  scheduleMail(
    'reserva-confirmada',
    mail.emailReservaConfirmada(req.user.email, {
      data: parsed.data,
      hora: parsed.hora,
      evento,
      nome: userDisplayName(req.user),
      origem: 'reserva',
    })
  );
  return { chave, reserva };
}

async function trocarReserva(req) {
  const { chave } = req.params;
  const { novaChave } = req.body || {};
  if (!novaChave) throw httpError(400, 'novaChave é obrigatória');

  const parsedAtual = parseChave(chave);
  if (!parsedAtual) throw httpError(400, 'Chave inválida');
  const atual = await repo.getReservaBySlot(parsedAtual.eventoId, parsedAtual.data, parsedAtual.hora);
  if (!atual || atual.email.toLowerCase() !== req.user.email.toLowerCase()) {
    throw httpError(404, 'Reserva não encontrada');
  }
  if (atual.status === 'falta' || atual.status === 'presente') {
    throw httpError(400, 'Não é possível trocar esta reserva');
  }

  const parsedNova = parseChave(novaChave);
  if (!parsedNova) throw httpError(400, 'novaChave inválida');
  if (String(parsedNova.eventoId) !== String(parsedAtual.eventoId)) {
    throw httpError(400, 'Só é possível trocar o horário no mesmo evento');
  }
  if (isPastSlot(parsedNova.data, parsedNova.hora)) {
    throw httpError(400, 'Novo horário já encerrado');
  }
  const eventoDestino = await repo.getEvento(parsedNova.eventoId);
  if (!eventoDestino) throw httpError(404, 'Evento não encontrado');
  assertHorarioReservavel(eventoDestino, parsedNova.hora);
  const destino = await repo.getReservaBySlot(parsedNova.eventoId, parsedNova.data, parsedNova.hora);
  if (destino) throw httpError(409, 'Novo horário indisponível');

  await repo.deleteReserva(parsedAtual.eventoId, parsedAtual.data, parsedAtual.hora);
  const reserva = await repo.upsertReserva({
    eventoId: parsedNova.eventoId,
    data: parsedNova.data,
    hora: parsedNova.hora,
    userId: req.user.id,
    email: req.user.email,
    nome: userDisplayName(req.user),
    status: 'ok',
    observacao: atual.observacao || '',
  });
  const evento = await repo.getEvento(parsedNova.eventoId);
  scheduleMail('troca-fila', notificarFilaParaVaga(chave));
  scheduleMail(
    'troca-confirmada',
    mail.emailReservaConfirmada(req.user.email, {
      data: parsedNova.data,
      hora: parsedNova.hora,
      evento,
      nome: userDisplayName(req.user),
      origem: 'troca',
    })
  );
  return { chave: novaChave, reserva, liberada: chave };
}

async function cancelarReserva(req) {
  const { chave } = req.params;
  const parsed = parseChave(chave);
  if (!parsed) throw httpError(400, 'Chave inválida');
  const atual = await repo.getReservaBySlot(parsed.eventoId, parsed.data, parsed.hora);
  if (!atual) throw httpError(404, 'Reserva não encontrada');

  const isOwner = atual.email.toLowerCase() === req.user.email.toLowerCase();
  if (!isOwner && !hasMassagemModulo(req)) throw httpError(403, 'Sem permissão');

  await repo.deleteReserva(parsed.eventoId, parsed.data, parsed.hora);
  const eventoCancel = await repo.getEvento(parsed.eventoId);
  scheduleMail(
    'cancelamento',
    mail.emailCancelamento(atual.email, {
      data: parsed.data,
      hora: parsed.hora,
      evento: eventoCancel,
      nome: atual.nome || '',
    })
  );
  scheduleMail('cancelamento-fila', notificarFilaParaVaga(chave));
  return { ok: true, chave };
}

async function minhasReservas(req) {
  const list = await repo.listReservasByEmail(req.user.email);
  const enriched = [];
  for (const r of list) {
    const evento = await repo.getEvento(r.eventoId);
    enriched.push({
      chave: makeChave(r.eventoId, r.data, r.hora),
      eventoId: r.eventoId,
      data: r.data,
      hora: r.hora,
      status: r.status,
      observacao: r.observacao || '',
      evento: evento
        ? { id: evento.id, nm: evento.nm, masso: evento.masso, local: evento.local }
        : null,
    });
  }
  const agora = Date.now();
  const proximas = enriched.filter((r) => {
    if (r.status === 'presente' || r.status === 'falta') return false;
    const [y, m, d] = r.data.split('-').map(Number);
    const [hh, mm] = r.hora.split(':').map(Number);
    return new Date(y, m - 1, d, hh, mm).getTime() >= agora;
  });
  const historico = enriched.filter((r) => !proximas.includes(r));
  return { proximas, historico };
}

async function listFila(eventoId) {
  if (!eventoId) throw httpError(400, 'eventoId é obrigatório');
  const list = await repo.listFilaByEvento(eventoId);
  return { fila: list.map((f, i) => ({ ...f, posicao: i + 1 })) };
}

async function entrarFila(req) {
  const { eventoId } = req.body || {};
  if (!eventoId) throw httpError(400, 'eventoId é obrigatório');
  const evento = await repo.getEvento(eventoId);
  if (!evento || evento.status !== 'ativo') throw httpError(400, 'Evento inválido');
  const existing = await repo.getFilaUsuario(req.user.email, eventoId);
  if (existing) throw httpError(400, 'Você já está na fila deste evento');
  const jaTem = await getReservaQueBloqueia(req.user.email, evento.data);
  if (jaTem) throw httpError(400, msgReservaUnica(jaTem));

  try {
    const item = await repo.enterFila({
      eventoId,
      userId: req.user.id,
      email: req.user.email,
      nome: userDisplayName(req.user),
    });
    const fila = await repo.listFilaByEvento(eventoId);
    const posicao = fila.findIndex((f) => f.id === item.id) + 1;
    return { item, posicao, total: fila.length };
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw httpError(400, 'Você já está na fila deste evento');
    throw err;
  }
}

async function sairFila(req) {
  const item = await repo.getFilaItem(req.params.id);
  if (!item) throw httpError(404, 'Item não encontrado');
  const isOwner = item.email.toLowerCase() === req.user.email.toLowerCase();
  if (!isOwner && !hasMassagemModulo(req)) throw httpError(403, 'Sem permissão');
  await repo.leaveFila(req.params.id);
  return { ok: true };
}

async function dashboard() {
  const ativos = await repo.listEventos({ all: false });
  const totalReservas = await repo.countReservasAtivas();
  const presentes = await repo.countReservasByStatus('presente');
  const faltas = await repo.countReservasByStatus('falta');
  const naFila = await repo.countFila();
  const eventos = [];
  for (const e of ativos) {
    const reservas = await repo.listReservasByEvento(e.id);
    const fila = await repo.listFilaByEvento(e.id);
    eventos.push({
      ...e,
      ocupacao: ocupacaoEvento(e, reservas),
      reservasCount: reservas.length,
      filaCount: fila.length,
    });
  }
  return {
    eventosAtivos: ativos.length,
    totalReservas,
    presentes,
    faltas,
    naFila,
    eventos,
  };
}

async function listReservasEvento(eventoId) {
  if (!eventoId) throw httpError(400, 'eventoId é obrigatório');
  const list = await repo.listReservasByEvento(eventoId);
  return list
    .map((r) => ({
      chave: makeChave(r.eventoId, r.data, r.hora),
      eventoId: r.eventoId,
      data: r.data,
      hora: r.hora,
      email: r.email,
      nome: r.nome,
      status: r.status,
      observacao: r.observacao,
    }))
    .sort((a, b) => a.hora.localeCompare(b.hora));
}

async function adminRemoverReserva(chave) {
  const parsed = parseChave(chave);
  if (!parsed) throw httpError(400, 'Chave inválida');
  const atual = await repo.getReservaBySlot(parsed.eventoId, parsed.data, parsed.hora);
  if (!atual) throw httpError(404, 'Reserva não encontrada');
  await repo.deleteReserva(parsed.eventoId, parsed.data, parsed.hora);
  const eventoCancelAdmin = await repo.getEvento(parsed.eventoId);
  scheduleMail(
    'admin-cancelamento',
    mail.emailCancelamento(atual.email, {
      data: parsed.data,
      hora: parsed.hora,
      evento: eventoCancelAdmin,
      nome: atual.nome || '',
    })
  );
  scheduleMail('admin-cancelamento-fila', notificarFilaParaVaga(chave));
  return { ok: true, chave };
}

async function tabletListaDia(eventoId, data, tabletUser) {
  const evento = await repo.getEvento(eventoId);
  await assertEventoDaEmpresaTablet(evento, tabletUser);
  const reservas = await repo.listReservasByEvento(eventoId);
  const items = evento.horarios.map((hora) => {
    const r = reservas.find((x) => x.data === String(data).slice(0, 10) && x.hora === hora);
    return {
      chave: makeChave(eventoId, data, hora),
      hora,
      nome: r ? r.nome : null,
      email: r ? r.email : null,
      status: r ? r.status : 'vazio',
      observacao: r?.observacao || '',
    };
  });
  for (const p of evento.pausas || []) {
    items.push({
      chave: `pausa:${eventoId}_${data}_${p.inicio}`,
      hora: p.inicio,
      horaFim: horaFimExclusivoPausa(p, evento.duracaoMin),
      nome: p.nome,
      email: null,
      status: 'pausa',
      observacao: '',
    });
  }
  items.sort((a, b) => String(a.hora).localeCompare(String(b.hora)));
  const fila = await repo.listFilaByEvento(eventoId);
  return {
    evento: {
      id: evento.id,
      nm: evento.nm,
      masso: evento.masso,
      local: evento.local,
      unidade: evento.unidade || '',
      data: evento.data,
    },
    data: String(data).slice(0, 10),
    stats: {
      presentes: items.filter((i) => i.status === 'presente').length,
      faltas: items.filter((i) => i.status === 'falta').length,
      confirmados: items.filter((i) => i.status === 'ok').length,
      naFila: fila.length,
    },
    items,
    fila: fila.map((f, i) => ({ ...f, posicao: i + 1 })),
  };
}

async function tabletPresenca(chave, status, tabletUser) {
  if (!['presente', 'falta'].includes(status)) {
    throw httpError(400, "status deve ser 'presente' ou 'falta'");
  }
  const parsed = parseChave(chave);
  if (!parsed) throw httpError(400, 'Chave inválida');
  const eventoChave = await repo.getEvento(parsed.eventoId);
  await assertEventoDaEmpresaTablet(eventoChave, tabletUser);
  const reserva = await repo.getReservaBySlot(parsed.eventoId, parsed.data, parsed.hora);
  if (!reserva) throw httpError(404, 'Reserva não encontrada');
  if (reserva.status === 'presente' || reserva.status === 'falta') {
    throw httpError(400, 'Presença já registrada');
  }
  const evento = eventoChave;
  const duracaoMin = Number(evento?.duracaoMin) || 50;
  if (
    !isDentroDoHorario(parsed.data, parsed.hora, duracaoMin, Date.now(), {
      graceMin: GRACE_ENCERRAMENTO_MIN,
    })
  ) {
    const fim = horaFimSlot(parsed.hora, duracaoMin);
    throw httpError(
      400,
      `Só é possível registrar presença no horário da sessão (${parsed.hora}–${fim}, +${GRACE_ENCERRAMENTO_MIN} min).`
    );
  }
  if (status === 'falta' && !isDentroDoHorarioFalta(parsed.data, parsed.hora, duracaoMin)) {
    throw httpError(
      400,
      `Só é possível registrar falta ${FALTA_CARENCIA_MIN} minutos após o início da sessão.`
    );
  }
  const updated = await repo.updateReservaStatus(parsed.eventoId, parsed.data, parsed.hora, status);
  try {
    await encerrarEventoSeDevido(evento);
  } catch (err) {
    console.error('[massagem-encerramento]', evento.id, err.message);
  }
  if (status === 'falta') {
    scheduleMail(
      'tablet-falta',
      mail.emailFaltaAdmin(reserva.email, {
        nome: reserva.nome,
        email: reserva.email,
        data: parsed.data,
        hora: parsed.hora,
        notificados: 0,
        evento,
      })
    );
    return {
      ok: true,
      chave,
      status: 'falta',
      filaNotificada: false,
      notificados: 0,
    };
  }
  return { ok: true, chave, status: 'presente', reserva: updated };
}

async function listEmpresasPublic() {
  const list = await repo.listEmpresas({ onlyAtivas: true });
  return list.map(({ id, nm, cor }) => ({ id, nm, cor }));
}

async function listEmpresasAdmin() {
  return repo.listEmpresas({ onlyAtivas: false });
}

async function createEmpresa(body) {
  const nm = String(body?.nm || '').trim() || 'Nova empresa';
  const cor = String(body?.cor || '#6B7280').trim();
  const email = String(body?.email || '').trim();
  return repo.createEmpresa({ nm, cor, email });
}

async function updateEmpresa(id, body) {
  const patch = {};
  if (body?.nm !== undefined) patch.nm = String(body.nm).trim() || undefined;
  if (body?.cor !== undefined) patch.cor = String(body.cor).trim();
  if (body?.email !== undefined) patch.email = String(body.email).trim();
  if (body?.ativo !== undefined) patch.ativo = !!body.ativo;
  const empresa = await repo.updateEmpresa(id, patch);
  if (!empresa) throw httpError(404, 'Empresa não encontrada');
  return empresa;
}

async function removeEmpresa(id) {
  const ok = await repo.removeEmpresa(id);
  if (!ok) throw httpError(404, 'Empresa não encontrada');
  return { ok: true };
}

async function getConfig() {
  return repo.getConfig();
}

async function saveConfig(body) {
  const emailsTeste = Array.isArray(body?.emailsTeste) ? body.emailsTeste : [];
  return repo.saveConfig({ emailsTeste });
}

function templateMeta() {
  return {
    codigos: TEMPLATE_CODIGOS.map((codigo) => ({
      codigo,
      nome: TEMPLATE_NOMES[codigo] || codigo,
      placeholders: PLACEHOLDERS_POR_CODIGO[codigo] || [],
    })),
  };
}

async function listEmailTemplates() {
  return repo.listEmailTemplates();
}

async function getEmailTemplate(id) {
  const t = await repo.getEmailTemplate(id);
  if (!t) throw httpError(404, 'Template não encontrado');
  return t;
}

async function createEmailTemplate(body) {
  const codigo = String(body?.codigo || '').trim();
  if (!isCodigoValido(codigo)) {
    throw httpError(400, `Código inválido. Use um de: ${TEMPLATE_CODIGOS.join(', ')}`);
  }
  const nome = String(body?.nome || TEMPLATE_NOMES[codigo] || codigo).trim();
  const assunto = String(body?.assunto || '').trim();
  const html = String(body?.html || '').trim();
  const texto = body?.texto != null ? String(body.texto).trim() : '';
  if (!nome) throw httpError(400, 'Informe o nome do template.');
  if (!assunto) throw httpError(400, 'Informe o assunto do e-mail.');
  if (!html) throw httpError(400, 'Informe o HTML do template.');
  const ativo = body?.ativo === undefined ? true : !!body.ativo;
  return repo.createEmailTemplate({
    id: crypto.randomUUID(),
    codigo,
    nome,
    assunto,
    html,
    texto,
    ativo,
  });
}

async function updateEmailTemplate(id, body) {
  const atual = await repo.getEmailTemplate(id);
  if (!atual) throw httpError(404, 'Template não encontrado');
  const patch = {};
  if (body?.nome !== undefined) {
    patch.nome = String(body.nome).trim();
    if (!patch.nome) throw httpError(400, 'Informe o nome do template.');
  }
  if (body?.assunto !== undefined) {
    patch.assunto = String(body.assunto).trim();
    if (!patch.assunto) throw httpError(400, 'Informe o assunto do e-mail.');
  }
  if (body?.html !== undefined) {
    patch.html = String(body.html).trim();
    if (!patch.html) throw httpError(400, 'Informe o HTML do template.');
  }
  if (body?.texto !== undefined) patch.texto = String(body.texto ?? '').trim();
  if (body?.ativo !== undefined) patch.ativo = !!body.ativo;
  return repo.updateEmailTemplate(id, patch);
}

async function removeEmailTemplate(id) {
  const ok = await repo.removeEmailTemplate(id);
  if (!ok) throw httpError(404, 'Template não encontrado');
  return { ok: true };
}

async function previewEmailTemplate(body) {
  let assunto = body?.assunto;
  let html = body?.html;
  let texto = body?.texto;
  let codigo = body?.codigo;

  if (body?.id) {
    const t = await repo.getEmailTemplate(body.id);
    if (!t) throw httpError(404, 'Template não encontrado');
    assunto = assunto != null ? assunto : t.assunto;
    html = html != null ? html : t.html;
    texto = texto != null ? texto : t.texto;
    codigo = codigo || t.codigo;
  }

  if (!codigo || !isCodigoValido(codigo)) {
    throw httpError(400, 'Código do template é obrigatório para o preview.');
  }
  if (assunto == null || html == null) {
    throw httpError(400, 'Assunto e HTML são obrigatórios para o preview.');
  }

  const baseUrl = (env.corsOrigins && env.corsOrigins[0]) || 'http://localhost:4201';
  const vars = {
    ...amostraVars(baseUrl),
    ...(body?.vars && typeof body.vars === 'object' ? body.vars : {}),
  };
  return renderTemplate({ assunto, html, texto }, vars);
}

async function getLayout() {
  return repo.getLayout();
}

async function saveLayout(body) {
  const atual = await repo.getLayout();
  const next = {
    brandNome:
      body?.brandNome !== undefined
        ? String(body.brandNome).trim() || atual.brandNome
        : atual.brandNome,
    brandIcone:
      body?.brandIcone !== undefined
        ? String(body.brandIcone).trim() || atual.brandIcone
        : atual.brandIcone,
    home: {
      eyebrow:
        body?.home?.eyebrow !== undefined
          ? String(body.home.eyebrow).trim()
          : atual.home.eyebrow,
      titulo:
        body?.home?.titulo !== undefined ? String(body.home.titulo).trim() : atual.home.titulo,
      tituloComplemento:
        body?.home?.tituloComplemento !== undefined
          ? String(body.home.tituloComplemento).trim()
          : atual.home.tituloComplemento,
      tituloDestaque:
        body?.home?.tituloDestaque !== undefined
          ? String(body.home.tituloDestaque).trim()
          : atual.home.tituloDestaque,
      subtitulo:
        body?.home?.subtitulo !== undefined
          ? String(body.home.subtitulo).trim()
          : atual.home.subtitulo,
      chips: Array.isArray(body?.home?.chips)
        ? body.home.chips
            .map((c) => ({
              icone: String(c?.icone || 'circle').trim() || 'circle',
              texto: String(c?.texto || '').trim(),
            }))
            .filter((c) => c.texto)
        : atual.home.chips,
    },
  };
  return repo.saveLayout(next);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

async function listListas() {
  return repo.listListas();
}

async function getLista(id) {
  const lista = await repo.getLista(id);
  if (!lista) throw httpError(404, 'Lista não encontrada');
  return lista;
}

async function createLista(body) {
  const empresaId = String(body?.empresaId || '').trim();
  const nome = String(body?.nome || '').trim();
  const descricao = String(body?.descricao || '').trim();
  const emailRaw = String(body?.email || '').trim();
  const email = emailRaw ? normalizeEmail(emailRaw) : '';
  const nomeContato = String(body?.nomeContato || '').trim();
  if (!empresaId) throw httpError(400, 'Empresa é obrigatória.');
  if (!nome) throw httpError(400, 'Nome da lista é obrigatório.');
  if (email && !EMAIL_RE.test(email)) {
    throw httpError(400, 'Informe um e-mail de grupo válido.');
  }
  const empresa = await repo.getEmpresa(empresaId);
  if (!empresa) throw httpError(404, 'Empresa não encontrada');
  try {
    return await repo.createLista({
      empresaId,
      nome,
      descricao,
      email: email || undefined,
      nomeContato,
    });
  } catch (err) {
    if (err && err.code === 'ER_DUP_ENTRY') {
      throw httpError(409, 'Já existe um registro com esses dados.');
    }
    throw err;
  }
}

async function updateLista(id, body) {
  const nome = String(body?.nome || '').trim();
  if (!nome) throw httpError(400, 'Nome da lista é obrigatório.');
  const descricao = body?.descricao !== undefined ? String(body.descricao).trim() : undefined;
  const lista = await repo.updateLista(id, { nome, descricao });
  if (!lista) throw httpError(404, 'Lista não encontrada');
  return lista;
}

async function removeLista(id) {
  const ok = await repo.removeLista(id);
  if (!ok) throw httpError(404, 'Lista não encontrada');
  return { ok: true };
}

async function listListaItens(listaId) {
  await getLista(listaId);
  return repo.listListaItens(listaId);
}

async function addListaItem(listaId, body) {
  await getLista(listaId);
  const email = normalizeEmail(body?.email);
  const nome = String(body?.nome || '').trim();
  if (!email || !EMAIL_RE.test(email)) {
    throw httpError(400, 'Informe um e-mail válido.');
  }
  try {
    return await repo.addListaItem({ listaId, email, nome });
  } catch (err) {
    if (err && err.code === 'ER_DUP_ENTRY') {
      throw httpError(409, 'Este e-mail já está na lista.');
    }
    throw err;
  }
}

async function removeListaItem(listaId, itemId) {
  await getLista(listaId);
  const ok = await repo.removeListaItem(listaId, itemId);
  if (!ok) throw httpError(404, 'E-mail não encontrado na lista');
  return { ok: true };
}

async function listEmailEnvios(query) {
  const email = String(query?.email || '').trim();
  const tipo = String(query?.tipo || '').trim();
  return repo.listEmailEnvios({ email, tipo, limit: 50 });
}

module.exports = {
  hasMassagemModulo,
  listEventos,
  createEvento,
  updateEvento,
  removeEvento,
  dispararEvento,
  listEventosAtivos,
  listSlots,
  createReserva,
  trocarReserva,
  cancelarReserva,
  minhasReservas,
  listFila,
  entrarFila,
  sairFila,
  dashboard,
  listReservasEvento,
  adminRemoverReserva,
  tabletListaDia,
  tabletPresenca,
  listEmpresasPublic,
  listEmpresasAdmin,
  createEmpresa,
  updateEmpresa,
  removeEmpresa,
  getLayout,
  saveLayout,
  getConfig,
  saveConfig,
  templateMeta,
  listEmailTemplates,
  getEmailTemplate,
  createEmailTemplate,
  updateEmailTemplate,
  removeEmailTemplate,
  previewEmailTemplate,
  listListas,
  getLista,
  createLista,
  updateLista,
  removeLista,
  listListaItens,
  addListaItem,
  removeListaItem,
  listEmailEnvios,
};
