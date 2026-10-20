const jwt = require('jsonwebtoken');
const jwksRsa = require('jwks-rsa');
const tenantsRepo = require('../../repositories/tenants.repository');
const { decrypt } = require('../../services/crypto.service');
const { env } = require('../../config/env');
const { HttpError } = require('./http');

const CACHE_MS = 60_000;
let cachedTenants = { at: 0, value: null };
const jwksClients = new Map();

function readEnv() {
  return {
    flag: process.env.ENTRA_ENABLED === 'true',
    tenantId: String(process.env.ENTRA_TENANT_ID || '').trim(),
    clientId: String(process.env.ENTRA_CLIENT_ID || '').trim(),
    clientSecret: String(process.env.ENTRA_CLIENT_SECRET || '').trim(),
  };
}

function publicOrigin(req) {
  const configured = String(env.publicAppUrl || '').replace(/\/+$/, '');
  if (configured) return configured;
  if (!req) return '';
  const proto = String(req.get('x-forwarded-proto') || req.protocol || 'https').split(',')[0].trim();
  const host = String(req.get('x-forwarded-host') || req.get('host') || '').split(',')[0].trim();
  if (!host) return '';
  return `${proto}://${host}`;
}

function taskhubRedirect(req) {
  const fromEnv = String(process.env.ENTRA_REDIRECT_URI || '').trim();
  const origin = publicOrigin(req);
  if (origin) return origin;
  return fromEnv;
}

function secretOf(ciphertext) {
  if (!ciphertext) return '';
  try { return decrypt(ciphertext) || ''; } catch { return ''; }
}

async function loadTenants() {
  const now = Date.now();
  if (cachedTenants.value && now - cachedTenants.at < CACHE_MS) return cachedTenants.value;

  let list = [];
  try {
    const rows = await tenantsRepo.findAll();
    list = rows
      .filter((row) => row.ativo && row.azure_tenant_id && row.client_id)
      .map((row) => {
        const secret = secretOf(row.client_secret_ciphertext);
        return {
          nome: row.nome || '',
          tenantId: String(row.azure_tenant_id).trim(),
          clientId: String(row.client_id).trim(),
          clientSecret: secret,
          hasSecret: !!secret,
          principal: !!row.eh_principal,
        };
      })
      .sort((a, b) => Number(b.principal) - Number(a.principal) || a.nome.localeCompare(b.nome, 'pt-BR'));
  } catch (err) {
    console.error('[taskhub] Não foi possível ler os tenants da intranet:', err.message);
  }

  if (!list.length) {
    const fallback = readEnv();
    if (fallback.flag && fallback.tenantId && fallback.clientId) {
      list = [{
        nome: '',
        tenantId: fallback.tenantId,
        clientId: fallback.clientId,
        clientSecret: fallback.clientSecret,
        hasSecret: !!fallback.clientSecret,
        principal: true,
      }];
    }
  }

  cachedTenants = { at: now, value: list };
  return list;
}

function publicTenant(tenant) {
  return {
    nome: tenant.nome,
    tenantId: tenant.tenantId,
    clientId: tenant.clientId,
    hasSecret: tenant.hasSecret,
    principal: tenant.principal,
  };
}

async function isEnabled() {
  const tenants = await loadTenants();
  return tenants.some((tenant) => tenant.hasSecret);
}

async function publicConfig(req) {
  const tenants = await loadTenants();
  const redirectUri = taskhubRedirect(req);
  const ready = tenants.filter((tenant) => tenant.tenantId && tenant.clientId && redirectUri);
  const first = ready[0];
  return {
    enabled: ready.length > 0,
    directory: tenants.some((tenant) => tenant.hasSecret),
    clientId: first?.clientId || '',
    tenantId: first?.tenantId || '',
    redirectUri: ready.length ? redirectUri : '',
    tenants: ready.map(publicTenant),
  };
}

async function adminStatus(req) {
  const pub = await publicConfig(req);
  return {
    enabled: pub.enabled,
    directory: pub.directory,
    redirectUri: pub.redirectUri,
    tenants: pub.tenants,
  };
}

function signingKeys(tenantId) {
  if (!jwksClients.has(tenantId)) {
    jwksClients.set(tenantId, jwksRsa({
      jwksUri: `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`,
      cache: true,
      rateLimit: true,
    }));
  }
  return jwksClients.get(tenantId);
}

function verifyJwt(idToken, tenantId, audiences) {
  const issuers = [
    `https://login.microsoftonline.com/${tenantId}/v2.0`,
    `https://sts.windows.net/${tenantId}/`,
  ];
  return new Promise((resolve, reject) => {
    jwt.verify(idToken, (header, callback) => {
      signingKeys(tenantId).getSigningKey(header.kid, (err, key) => {
        if (err) return callback(err);
        callback(null, key.getPublicKey());
      });
    }, {
      audience: audiences,
      issuer: issuers,
      algorithms: ['RS256'],
    }, (err, payload) => (err ? reject(err) : resolve(payload)));
  });
}

async function verifyIdToken(idToken) {
  const tenants = await loadTenants();
  if (!tenants.length) throw new HttpError(422, 'Login Microsoft não está configurado neste ambiente.');
  const decoded = jwt.decode(idToken);
  const tid = String(decoded?.tid || '');
  const tenant = tenants.find((item) => item.tenantId === tid);
  if (!tenant) throw new HttpError(401, 'Não foi possível validar o login da Microsoft.');
  const audiences = [...new Set(tenants.map((item) => item.clientId).filter(Boolean))];
  let payload;
  try {
    payload = await verifyJwt(idToken, tenant.tenantId, audiences);
  } catch {
    throw new HttpError(401, 'Não foi possível validar o login da Microsoft.');
  }
  const oid = String(payload.oid || '');
  const email = String(payload.email || payload.preferred_username || '').trim().toLowerCase();
  if (!oid) throw new HttpError(401, 'Não foi possível validar o login da Microsoft.');
  return { oid, email };
}

async function tokenFor(tenant) {
  const body = new URLSearchParams({
    client_id: tenant.clientId,
    client_secret: tenant.clientSecret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });
  let res;
  try {
    res = await fetch(`https://login.microsoftonline.com/${tenant.tenantId}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new HttpError(502, 'Não foi possível autenticar no diretório Microsoft.');
  }
  if (!res.ok) throw new HttpError(502, 'Não foi possível autenticar no diretório Microsoft.');
  const json = await res.json();
  if (!json.access_token) throw new HttpError(502, 'Não foi possível autenticar no diretório Microsoft.');
  return json.access_token;
}

async function directoryTokens() {
  const tenants = (await loadTenants()).filter((tenant) => tenant.hasSecret);
  if (!tenants.length) throw new HttpError(422, 'O diretório Microsoft não está configurado neste ambiente.');
  const tokens = [];
  for (const tenant of tenants) tokens.push(await tokenFor(tenant));
  return tokens;
}

async function graphToken() {
  const [token] = await directoryTokens();
  return token;
}

module.exports = { isEnabled, publicConfig, adminStatus, verifyIdToken, graphToken, directoryTokens };
