const { sendEmail, getMailSender, NOT_CONFIGURED_MSG } = require('../utils/emailSender');
const { env } = require('../config/env');
const repo = require('../repositories/massagem.repository');
const { renderTemplate, buildVars } = require('../utils/massagem-email-template.util');
const { httpError, toDateStr } = require('../utils/massagem.util');

function appBaseUrl() {
  return (env.corsOrigins && env.corsOrigins[0]) || 'http://localhost:4201';
}

function wrap(body) {
  return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;color:#111827;background:#F7FAF8;padding:24px;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #E5E7EB;border-radius:12px;padding:24px;">
    <div style="color:#1d54e6;font-weight:700;font-size:18px;margin-bottom:16px;">Bem-estar · Massagem</div>
    ${body}
  </div>
  </body></html>`;
}

async function logEnvioInicio(meta) {
  try {
    return await repo.createEmailEnvio(meta);
  } catch (err) {
    console.warn('[massagem-mail] log envio:', err.message);
    return null;
  }
}

async function logDestino(envioId, dest) {
  if (!envioId) return;
  try {
    await repo.addEmailEnvioDestino({ envioId, ...dest });
  } catch (err) {
    console.warn('[massagem-mail] log destino:', err.message);
  }
}

async function logEnvioFim(envioId, stats) {
  if (!envioId) return;
  try {
    await repo.finishEmailEnvio(envioId, stats);
  } catch (err) {
    console.warn('[massagem-mail] log fim:', err.message);
  }
}

function statusLote(enviados, falhas, total) {
  if (falhas === 0 && enviados > 0) return 'ok';
  if (enviados === 0 && total > 0) return 'erro';
  if (falhas > 0 && enviados > 0) return 'parcial';
  return total === 0 ? 'ok' : 'erro';
}

async function safeSend(opts, meta = {}) {
  try {
    const emailsTeste = await repo.getEmailsTeste();
    const modo = emailsTeste.length ? 'teste' : meta.modo || 'direto';
    const targets = emailsTeste.length ? emailsTeste : [opts.to].filter(Boolean);

    const envio = await logEnvioInicio({
      tipo: meta.tipo || 'reserva_confirmada',
      origem: meta.origem || 'reserva',
      modo,
      eventoId: meta.evento?.id || null,
      eventoNm: meta.evento?.nm || '',
      eventoData: toDateStr(meta.evento?.data) || null,
      assunto: opts.subject || '',
      total: targets.length,
    });
    const envioId = envio?.id || null;

    const resultados = await Promise.all(
      targets.map(async (to) => {
        try {
          const result = await sendEmail({ ...opts, to });
          await logDestino(envioId, {
            email: to,
            nome: meta.nome || '',
            status: 'enviado',
            messageId: result?.messageId || null,
          });
          return { ok: true };
        } catch (err) {
          await logDestino(envioId, {
            email: to,
            nome: meta.nome || '',
            status: 'falha',
            erro: err.message,
          });
          return { ok: false };
        }
      })
    );

    const enviados = resultados.filter((r) => r.ok).length;
    const falhas = resultados.length - enviados;
    await logEnvioFim(envioId, {
      total: targets.length,
      enviados,
      falhas,
      status: statusLote(enviados, falhas, targets.length),
    });
    return { ok: falhas === 0 };
  } catch (err) {
    console.warn('[massagem-mail]', err.message);
    return { ok: false, erro: err.message };
  }
}

function transactionalOpts(opts, label) {
  return { ...opts, priority: 'high', acsLabel: label };
}

function varsFrom(ctx) {
  return buildVars({ ...ctx, baseUrl: appBaseUrl() });
}

async function resolveContent(codigo, vars, fallback) {
  const template = await repo.findEmailTemplateByCodigo(codigo, { onlyAtivo: true });
  if (template) {
    const rendered = renderTemplate(
      { assunto: template.assunto, html: template.html, texto: template.texto },
      vars
    );
    return {
      subject: rendered.assunto,
      html: rendered.html,
      text: rendered.texto || fallback.text,
    };
  }
  return fallback;
}

function fallbackDisparo(evento, vars) {
  const url = vars.link_reserva;
  return {
    subject: 'Sessão de massagem disponível — reserve sua vaga',
    html: wrap(`
      <p>Olá!</p>
      <p>Uma nova sessão de massagem está disponível:</p>
      <p><strong>${evento.nm}</strong><br/>
      Data: ${evento.data}<br/>
      Local: ${evento.local}<br/>
      Massoterapeuta: ${evento.masso}</p>
      <p><a href="${url}" style="display:inline-block;background:#1d54e6;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;">Reservar horário</a></p>
    `),
    text: `Sessão disponível: ${evento.nm} em ${evento.data}. Reserve: ${url}`,
  };
}

async function emailDisparoEvento(to, evento, { nome } = {}) {
  const vars = varsFrom({ nome: nome || '', evento });
  const content = await resolveContent('disparo_evento', vars, fallbackDisparo(evento, vars));
  return safeSend(
    { to, ...content, acsLabel: 'massagem-disparo' },
    { tipo: 'disparo_evento', origem: 'disparo', evento, nome: nome || '' }
  );
}

/**
 * Envia um template (padrão disparo_evento) para destinos já resolvidos
 * (lista da empresa, ou e-mails de teste se a lista estiver vazia).
 * Sem throttle extra: o sendEmail da intranet já aplica o limite ACS.
 */
async function enviarDisparoLista(destinos, evento, codigo = 'disparo_evento', { modoTeste = false } = {}) {
  const sender = await getMailSender();
  if (!sender) {
    throw httpError(400, NOT_CONFIGURED_MSG);
  }

  const targets = (destinos || []).filter((d) => d && d.email);

  if (!targets.length) {
    return { enviados: 0, erros: [], modoTeste };
  }

  const assuntoPreview = (await resolveContent(
    codigo,
    varsFrom({ nome: targets[0].nome || '', email: targets[0].email, evento }),
    fallbackDisparo(evento, varsFrom({ evento }))
  )).subject;

  const envio = await logEnvioInicio({
    tipo: codigo,
    origem: 'disparo',
    modo: modoTeste ? 'teste' : 'lista',
    eventoId: evento?.id || null,
    eventoNm: evento?.nm || '',
    eventoData: toDateStr(evento?.data) || null,
    assunto: assuntoPreview || '',
    total: targets.length,
  });
  const envioId = envio?.id || null;

  const erros = [];
  let enviados = 0;

  for (const dest of targets) {
    const vars = varsFrom({ nome: dest.nome || '', email: dest.email, evento });
    const fallback = fallbackDisparo(evento, vars);
    const content = await resolveContent(codigo, vars, fallback);

    try {
      const result = await sendEmail({
        to: dest.email,
        ...content,
        priority: 'normal',
        acsLabel: 'massagem-disparo',
      });
      enviados += 1;
      await logDestino(envioId, {
        email: dest.email,
        nome: dest.nome || '',
        status: 'enviado',
        messageId: result?.messageId || null,
      });
    } catch (err) {
      erros.push({ email: dest.email, mensagem: err.message });
      await logDestino(envioId, {
        email: dest.email,
        nome: dest.nome || '',
        status: 'falha',
        erro: err.message,
      });
    }
  }

  await logEnvioFim(envioId, {
    total: targets.length,
    enviados,
    falhas: erros.length,
    status: statusLote(enviados, erros.length, targets.length),
  });

  return { enviados, erros, modoTeste };
}

async function assertMailConfigured() {
  const sender = await getMailSender();
  if (!sender) throw httpError(400, NOT_CONFIGURED_MSG);
}

async function emailReservaConfirmada(to, { data, hora, evento, nome, origem }) {
  const vars = varsFrom({ nome: nome || '', data, hora, evento });
  const content = await resolveContent('reserva_confirmada', vars, {
    subject: `Reserva confirmada — ${data} às ${hora}`,
    html: wrap(`
      <p>Sua reserva foi confirmada.</p>
      <p><strong>${evento?.nm || 'Massagem'}</strong><br/>
      ${data} às ${hora}<br/>
      ${evento?.local || ''}</p>
    `),
    text: `Reserva confirmada: ${data} às ${hora}`,
  });
  return safeSend(transactionalOpts({ to, ...content }, 'reserva-confirmada'), {
    tipo: 'reserva_confirmada',
    origem: origem || 'reserva',
    evento,
    nome: nome || '',
  });
}

async function emailCancelamento(to, { data, hora, evento, nome }) {
  const vars = varsFrom({ nome: nome || '', data, hora, evento });
  const content = await resolveContent('cancelamento', vars, {
    subject: 'Reserva cancelada',
    html: wrap(`
      <p>Sua reserva em <strong>${data}</strong> às <strong>${hora}</strong> foi cancelada.</p>
    `),
    text: `Reserva cancelada: ${data} às ${hora}`,
  });
  return safeSend(transactionalOpts({ to, ...content }, 'cancelamento'), {
    tipo: 'cancelamento',
    origem: 'cancelamento',
    evento,
    nome: nome || '',
  });
}

async function emailFilaVagaAberta(to, { data, hora, eventoId, evento, nome }) {
  let ev = evento;
  if (!ev && eventoId) {
    ev = await repo.getEvento(eventoId);
  }
  if (ev && !ev.id && eventoId) ev = { ...ev, id: eventoId };
  if (ev && eventoId && !ev.id) ev.id = eventoId;
  const vars = varsFrom({
    nome: nome || '',
    data,
    hora,
    evento: ev || { id: eventoId },
  });
  const url = vars.link_reserva;
  const content = await resolveContent('fila_vaga', vars, {
    subject: 'Vaga disponível — reserve agora',
    html: wrap(`
      <p>Uma vaga abriu na sessão de massagem.</p>
      <p>Horário liberado: <strong>${data} às ${hora}</strong></p>
      <p>Todos na fila receberam este alerta. <strong>Quem reservar o horário primeiro garante a sessão.</strong></p>
      <p><a href="${url}" style="display:inline-block;background:#1d54e6;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;">Ver horários e reservar</a></p>
    `),
    text: `Vaga disponível ${data} às ${hora}. Reserve: ${url}`,
  });
  return safeSend(transactionalOpts({ to, ...content }, 'fila-vaga'), {
    tipo: 'fila_vaga',
    origem: 'fila',
    evento: ev || { id: eventoId },
    nome: nome || '',
  });
}

async function buildFaltaAdminContent({ nome, email, data, hora, evento, notificados = 0 }) {
  const n = Number(notificados) || 0;
  const filaTexto =
    n > 0
      ? `A fila de espera foi notificada (${n} pessoa${n === 1 ? '' : 's'}).`
      : 'Ninguém estava na fila de espera — nenhum alerta de vaga foi enviado.';
  const vars = varsFrom({
    nome: nome || '',
    email: email || '',
    data,
    hora,
    evento,
    totalFila: n,
    filaTexto,
  });
  return resolveContent('falta_admin', vars, {
    subject: `Falta registrada — ${data} às ${hora}`,
    html: wrap(`
      <p>Sua ausência foi registrada.</p>
      <p>Você não compareceu em <strong>${data}</strong> às <strong>${hora}</strong>.</p>
    `),
    text: `Sua ausência foi registrada em ${data} às ${hora}.`,
  });
}

async function emailFaltaAdmin(to, payload) {
  const content = await buildFaltaAdminContent(payload);
  return safeSend(transactionalOpts({ to, ...content }, 'falta-admin'), {
    tipo: 'falta_admin',
    origem: 'falta',
    evento: payload?.evento,
    nome: payload?.nome || '',
  });
}

async function emailLembrete(to, { data, hora, evento, nome }) {
  const vars = varsFrom({ nome: nome || '', data, hora, evento });
  const content = await resolveContent('lembrete', vars, {
    subject: 'Lembrete: sua massagem é daqui a 1 hora',
    html: wrap(`
      <p>Lembrete: sua sessão de massagem é em aproximadamente 1 hora.</p>
      <p><strong>${evento?.nm || 'Massagem'}</strong><br/>
      ${data} às ${hora}<br/>
      ${evento?.local || ''}</p>
    `),
    text: `Lembrete massagem: ${data} às ${hora}`,
  });
  return safeSend(transactionalOpts({ to, ...content }, 'lembrete'), {
    tipo: 'lembrete',
    origem: 'lembrete',
    evento,
    nome: nome || '',
  });
}

module.exports = {
  emailDisparoEvento,
  enviarDisparoLista,
  assertMailConfigured,
  emailReservaConfirmada,
  emailCancelamento,
  emailFilaVagaAberta,
  emailFaltaAdmin,
  emailLembrete,
};
