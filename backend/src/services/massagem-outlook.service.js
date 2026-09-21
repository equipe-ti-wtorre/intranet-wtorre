const { env } = require('../config/env');
const graphService = require('./graph.service');
const repo = require('../repositories/massagem.repository');
const usersRepo = require('../repositories/users.repository');
const colaboradoresRepo = require('../repositories/colaboradores.repository');
const tenantsRepo = require('../repositories/tenants.repository');
const { horaFimSlot } = require('../utils/massagem.util');

const TZ = 'America/Sao_Paulo';
const REMINDER_MIN = 15;

function appBaseUrl() {
  return (env.corsOrigins && env.corsOrigins[0]) || 'http://localhost:4201';
}

function scheduleOutlook(label, promise) {
  Promise.resolve(promise).catch((err) => {
    console.warn(`[massagem] outlook background (${label}):`, err?.message || err);
  });
}

function graphEventUrl(graphUserId, eventId) {
  const base = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(graphUserId)}/events`;
  return eventId ? `${base}/${encodeURIComponent(eventId)}` : base;
}

function toDateTimeLocal(data, hora) {
  const dia = String(data || '').slice(0, 10);
  const hm = String(hora || '').trim().slice(0, 5);
  return `${dia}T${hm}:00`;
}

function toEndDateTime(data, hora, duracaoMin) {
  const inicio = String(hora || '').trim().slice(0, 5);
  const fim = horaFimSlot(inicio, duracaoMin);
  const [hhStart] = inicio.split(':').map(Number);
  const [hhEnd] = String(fim).split(':').map(Number);
  let dia = String(data || '').slice(0, 10);
  if (Number.isFinite(hhStart) && Number.isFinite(hhEnd) && hhEnd < hhStart) {
    const d = new Date(`${dia}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    dia = d.toISOString().slice(0, 10);
  }
  return toDateTimeLocal(dia, fim);
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildEventPayload(reserva, evento) {
  const unidade = String(evento?.unidade || '').trim();
  const local = String(evento?.local || '').trim();
  const masso = String(evento?.masso || '').trim();
  const duracao = Number(evento?.duracaoMin) || 50;
  const eventoId = evento?.id != null ? String(evento.id) : '';
  const link = eventoId
    ? `${appBaseUrl().replace(/\/$/, '')}/massagem/evento/${eventoId}`
    : `${appBaseUrl().replace(/\/$/, '')}/massagem`;
  const linhas = ['Sessão de massagem'];
  if (masso) linhas.push(`Massoterapeuta: ${masso}`);
  if (local) linhas.push(`Local: ${local}`);
  if (unidade) linhas.push(`Unidade: ${unidade}`);
  linhas.push(`Duração: ${duracao} min`);
  linhas.push(`Gerenciar reserva: ${link}`);

  return {
    subject: unidade ? `Massagem · ${unidade}` : 'Massagem',
    body: {
      contentType: 'HTML',
      content: linhas.map((l) => `<p>${escapeHtml(l)}</p>`).join(''),
    },
    start: { dateTime: toDateTimeLocal(reserva.data, reserva.hora), timeZone: TZ },
    end: { dateTime: toEndDateTime(reserva.data, reserva.hora, duracao), timeZone: TZ },
    location: local ? { displayName: local } : undefined,
    isReminderOn: true,
    reminderMinutesBeforeStart: REMINDER_MIN,
    showAs: 'busy',
    sensitivity: 'private',
  };
}

async function graphRequest(token, url, { method, body } = {}) {
  const res = await fetch(url, {
    method: method || 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204 || res.status === 202) return { status: res.status };
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data.error?.message || `Falha Graph ${res.status}`;
    const err = new Error(message);
    err.status = res.status;
    err.code = data.error?.code || null;
    throw err;
  }
  return data;
}

async function carregarUsuario(reserva) {
  if (reserva?.userId) {
    const byId = await usersRepo.findById(reserva.userId);
    if (byId) return byId;
  }
  const email = String(reserva?.email || '').trim();
  if (!email) return null;
  return usersRepo.findByEmail(email);
}

async function resolverTenant(user) {
  let colab = null;
  if (user.microsoft_id) {
    colab = await colaboradoresRepo.findAdminByAdId(user.microsoft_id);
  }
  if (!colab && user.email) {
    colab = await colaboradoresRepo.findAdminByEmail(user.email);
  }
  if (colab?.tenant_id) {
    const tenant = await tenantsRepo.findActiveWithSecret(colab.tenant_id);
    if (tenant) return tenant;
  }
  return tenantsRepo.findPrincipal();
}

async function resolverContexto(reserva) {
  const user = await carregarUsuario(reserva);
  if (!user || !user.is_ad_user) return null;

  const tenant = await resolverTenant(user);
  if (!tenant?.client_secret_ciphertext) {
    console.warn('[massagem] outlook: tenant Graph não encontrado para', user.email);
    return null;
  }

  const graphUserId = user.microsoft_id || user.email;
  if (!graphUserId) return null;

  return { user, tenant, graphUserId };
}

async function persistirMapping(reservaId, graphEventId, graphUserId, tenantId) {
  if (!reservaId || !graphEventId) return;
  await repo.upsertReservaOutlook({
    reservaId,
    graphEventId,
    graphUserId,
    tenantId,
  });
}

async function criarEventoGraph(ctx, reserva, evento) {
  const token = await graphService.getAppToken(ctx.tenant);
  const payload = buildEventPayload(reserva, evento);
  const created = await graphRequest(token, graphEventUrl(ctx.graphUserId), {
    method: 'POST',
    body: payload,
  });
  if (!created?.id) {
    throw new Error('Graph não retornou id do evento de calendário.');
  }
  await persistirMapping(reserva.id, created.id, ctx.graphUserId, ctx.tenant.id);
  return created.id;
}

async function agendarReservaNoOutlook(reserva, evento) {
  if (!reserva?.id || !evento) return;
  const ctx = await resolverContexto(reserva);
  if (!ctx) return;
  await criarEventoGraph(ctx, reserva, evento);
}

async function atualizarReservaNoOutlook(mapping, reserva, evento) {
  if (!reserva?.id || !evento) return;
  const ctx = await resolverContexto(reserva);
  if (!ctx) return;

  const graphUserId = mapping?.graphUserId || ctx.graphUserId;
  const eventId = mapping?.graphEventId;
  if (eventId) {
    try {
      const token = await graphService.getAppToken(ctx.tenant);
      await graphRequest(token, graphEventUrl(graphUserId, eventId), {
        method: 'PATCH',
        body: buildEventPayload(reserva, evento),
      });
      await persistirMapping(reserva.id, eventId, graphUserId, ctx.tenant.id);
      return;
    } catch (err) {
      if (err.status !== 404) throw err;
    }
  }

  await criarEventoGraph(ctx, reserva, evento);
}

async function removerReservaDoOutlook(mapping) {
  if (!mapping?.graphEventId || !mapping.graphUserId) return;
  let tenant = null;
  if (mapping.tenantId) {
    tenant = await tenantsRepo.findActiveWithSecret(mapping.tenantId);
  }
  if (!tenant) tenant = await tenantsRepo.findPrincipal();
  if (!tenant?.client_secret_ciphertext) return;

  const token = await graphService.getAppToken(tenant);
  try {
    await graphRequest(token, graphEventUrl(mapping.graphUserId, mapping.graphEventId), {
      method: 'DELETE',
    });
  } catch (err) {
    if (err.status === 404) return;
    throw err;
  }
}

module.exports = {
  scheduleOutlook,
  agendarReservaNoOutlook,
  atualizarReservaNoOutlook,
  removerReservaDoOutlook,
};
