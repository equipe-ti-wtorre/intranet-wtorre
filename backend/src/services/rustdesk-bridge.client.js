const { env } = require('../config/env');

const TIMEOUT_MS = 10_000;

function baseUrl() {
  return String(env.rustdeskBridgeUrl || '').replace(/\/$/, '');
}

/**
 * GET no rustdesk-bridge. Nunca lança: devolve { status, body, erroRede }.
 * Não loga a API key.
 */
async function getJson(caminho, { withKey = true } = {}) {
  const base = baseUrl();
  if (!base) {
    return {
      status: 0,
      body: { mensagem: 'Bridge RustDesk não configurado.' },
      erroRede: true,
    };
  }

  const headers = { Accept: 'application/json' };
  if (withKey) {
    if (!env.rustdeskBridgeApiKey) {
      return {
        status: 401,
        body: { mensagem: 'API key do bridge não configurada.' },
        erroRede: false,
      };
    }
    headers['x-api-key'] = env.rustdeskBridgeApiKey;
  }

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${base}${caminho}`, { headers, signal: ctrl.signal });
    let body = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    return { status: res.status, body, erroRede: false };
  } catch (err) {
    const aborted = err?.name === 'AbortError';
    console.error(`[rustdesk.bridge] falha ${caminho}:`, aborted ? 'timeout' : err.message);
    return {
      status: 0,
      body: { mensagem: aborted ? 'Timeout ao consultar o bridge.' : 'Falha de rede no bridge.' },
      erroRede: true,
    };
  } finally {
    clearTimeout(t);
  }
}

function getHealth() {
  return getJson('/health', { withKey: false });
}

function getPeers() {
  return getJson('/peers');
}

function getPeer(rustdeskId) {
  return getJson(`/peers/${encodeURIComponent(String(rustdeskId))}`);
}

function getStats() {
  return getJson('/stats');
}

function getMetricas() {
  return getJson('/metricas');
}

module.exports = {
  getJson,
  getHealth,
  getPeers,
  getPeer,
  getStats,
  getMetricas,
};
