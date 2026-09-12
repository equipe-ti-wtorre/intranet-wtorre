const salasConfigService = require('./salas-config.service');
const salasUiConfigService = require('./salas-ui-config.service');
const { resolveApiLocalidade } = require('./salas-ui-config.resolver');
const { salasRequest } = require('./salas-api.client');

const TTL_ROOMS_MS = 10 * 60 * 1000;
const TTL_SCHEDULE_MS = 60 * 1000;
const TTL_BOOKINGS_MS = 60 * 1000;
const TTL_CONFIG_MS = 30 * 1000;

const cache = new Map();

function readCache(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) return null;
  return entry.data;
}

function writeCache(key, data, ttlMs) {
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

function scheduleCacheKey(localidade, start, rooms) {
  const day = String(start || '').slice(0, 10);
  const emails = [...(rooms || [])].map((e) => String(e).toLowerCase()).sort();
  return `schedule:${localidade}:${day}:${emails.join(',')}`;
}

function bookingsCacheKey(localidade, start) {
  const day = String(start || '').slice(0, 10);
  return `bookings:${localidade}:${day}`;
}

async function getCachedConfig() {
  const cached = readCache('config:active');
  if (cached) return cached;

  const config = await salasConfigService.getInternalConfig({ requireActive: true });
  writeCache('config:active', config, TTL_CONFIG_MS);
  return config;
}

async function getCachedAllowedLocalidades() {
  const cached = readCache('config:allowedLocalidades');
  if (cached) return cached;

  const allowed = await salasUiConfigService.getAllowedLocalidades();
  writeCache('config:allowedLocalidades', allowed, TTL_CONFIG_MS);
  return allowed;
}

async function assertConfigured() {
  return getCachedConfig();
}

async function getUiConfig() {
  await assertConfigured();
  return salasUiConfigService.getPublicUiConfig();
}

async function resolveLocalidade(requested) {
  const config = await assertConfigured();
  const allowed = await getCachedAllowedLocalidades();

  const fallback = allowed.includes(config.localidade_padrao)
    ? config.localidade_padrao
    : allowed[0];
  const localidade = (requested || fallback).trim();

  if (!allowed.includes(localidade)) {
    const err = new Error(`Localidade inválida: ${localidade}.`);
    err.status = 400;
    throw err;
  }

  return localidade;
}

async function getRooms(localidade) {
  const config = await assertConfigured();
  const loc = await resolveLocalidade(localidade);
  const key = `rooms:${loc}`;
  const cached = readCache(key);
  if (cached) return cached;

  const data = await salasRequest(config.api_base_url, loc, '/rooms');
  writeCache(key, data, TTL_ROOMS_MS);
  return data;
}

async function getSchedule(localidade, payload) {
  const config = await assertConfigured();
  const loc = await resolveLocalidade(localidade);
  const key = scheduleCacheKey(loc, payload?.start, payload?.rooms);
  const cached = readCache(key);
  if (cached) return cached;

  const data = await salasRequest(config.api_base_url, loc, '/schedule', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
  });
  writeCache(key, data, TTL_SCHEDULE_MS);
  return data;
}

async function previewAvailability(localidade, payload) {
  const config = await assertConfigured();
  const loc = await resolveLocalidade(localidade);
  return salasRequest(config.api_base_url, loc, '/availability/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
  });
}

async function book(localidade, user, payload) {
  const config = await assertConfigured();
  const loc = await resolveLocalidade(localidade);

  if (!user?.email) {
    const err = new Error('Usuário sem e-mail válido para reservar.');
    err.status = 400;
    throw err;
  }

  const requesterEmail = String(payload?.requesterEmail || '')
    .trim()
    .toLowerCase();
  if (!requesterEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requesterEmail)) {
    const err = new Error('E-mail do organizador inválido.');
    err.status = 400;
    throw err;
  }

  const body = {
    ...payload,
    requesterEmail,
  };
  const result = await salasRequest(config.api_base_url, loc, '/book', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  invalidateScheduleAndBookingsCache(payload?.start?.slice?.(0, 10));
  return result;
}

async function listBookings(localidade, start, end) {
  const config = await assertConfigured();
  const loc = await resolveLocalidade(localidade);
  const key = bookingsCacheKey(loc, start);
  const cached = readCache(key);
  if (cached) return cached;

  const data = await salasRequest(config.api_base_url, loc, '/bookings', {
    query: { start, end },
  });
  writeCache(key, data, TTL_BOOKINGS_MS);
  return data;
}

async function resolveLocalidadeFromUserEmail(userEmail) {
  const config = await assertConfigured();
  const uiConfig = await salasUiConfigService.getPublicUiConfig();
  const domain = String(userEmail || '').trim().toLowerCase().split('@').pop();
  const mapped = domain ? resolveApiLocalidade(domain, uiConfig) : null;
  if (mapped) {
    return resolveLocalidade(mapped);
  }
  return resolveLocalidade(config.localidade_padrao);
}

async function listMyMeetings(user, start, end) {
  const config = await assertConfigured();
  const email = String(user?.email || '').trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const err = new Error('Usuário sem e-mail válido.');
    err.status = 400;
    throw err;
  }

  const loc = await resolveLocalidadeFromUserEmail(email);
  const key = `my-meetings:${loc}:${email}:${String(start || '').slice(0, 10)}`;
  const cached = readCache(key);
  if (cached) return cached;

  const data = await salasRequest(config.api_base_url, loc, '/my-meetings', {
    query: { userEmail: email, start, end },
  });
  writeCache(key, data, TTL_BOOKINGS_MS);
  return data;
}

async function cancelBooking(localidade, user, eventId, query = {}) {
  const config = await assertConfigured();
  const loc = await resolveLocalidade(localidade);
  const bookings = await listBookings(loc, query.start, query.end).catch(() => null);
  const lista = bookings?.bookings || bookings || [];
  const alvo = Array.isArray(lista)
    ? lista.find((b) => b.eventId === eventId || b.id === eventId)
    : null;

  if (alvo) {
    const organizer = (alvo.organizer || alvo.organizerEmail || alvo.requesterEmail || '').toLowerCase();
    const isOrganizer = organizer && organizer === String(user.email || '').toLowerCase();
    const isAdmin = user?.perfil === 'ADMIN';
    if (organizer && !isOrganizer && !isAdmin) {
      const err = new Error('Você só pode cancelar reservas das quais é o organizador.');
      err.status = 403;
      throw err;
    }
  }

  const result = await salasRequest(config.api_base_url, loc, `/bookings/${encodeURIComponent(eventId)}`, {
    method: 'DELETE',
    query,
  });
  invalidateScheduleAndBookingsCache(query.start?.slice?.(0, 10));
  return result;
}

async function searchUsers(localidade, query) {
  const config = await assertConfigured();
  const loc = await resolveLocalidade(localidade);
  const q = String(query || '').trim();
  if (q.length < 2) {
    const err = new Error('Informe ao menos 2 caracteres para buscar.');
    err.status = 400;
    throw err;
  }
  return salasRequest(config.api_base_url, loc, '/directory/users', { query: { query: q } });
}

function invalidateScheduleAndBookingsCache(dayIso) {
  for (const key of [...cache.keys()]) {
    if (!key.startsWith('schedule:') && !key.startsWith('bookings:') && !key.startsWith('my-meetings:')) {
      continue;
    }
    if (!dayIso || key.includes(`:${dayIso}:`) || key.endsWith(`:${dayIso}`)) {
      cache.delete(key);
    }
  }
}

function invalidarCache() {
  cache.clear();
}

module.exports = {
  getUiConfig,
  getRooms,
  getSchedule,
  previewAvailability,
  book,
  listBookings,
  listMyMeetings,
  cancelBooking,
  searchUsers,
  resolveLocalidade,
  resolveLocalidadeFromUserEmail,
  invalidarCache,
  invalidateScheduleAndBookingsCache,
};
