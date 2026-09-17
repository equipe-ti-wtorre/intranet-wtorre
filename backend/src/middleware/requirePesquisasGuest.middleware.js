const jwtService = require('../services/jwt.service');

function collectHashes(payload) {
  const raw = [];
  if (Array.isArray(payload.cpfHashes)) raw.push(...payload.cpfHashes);
  if (typeof payload.cpfHash === 'string') raw.push(payload.cpfHash);
  const out = [];
  const seen = new Set();
  for (const item of raw) {
    const h = String(item || '').trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(h) || seen.has(h)) continue;
    seen.add(h);
    out.push(h);
    if (out.length >= 20) break;
  }
  return out;
}

function collectEmails(payload) {
  const raw = [];
  if (Array.isArray(payload.emails)) raw.push(...payload.emails);
  if (typeof payload.email === 'string') raw.push(payload.email);
  const out = [];
  const seen = new Set();
  for (const item of raw) {
    const e = String(item || '').trim().toLowerCase().slice(0, 200);
    if (!e.includes('@') || seen.has(e)) continue;
    seen.add(e);
    out.push(e);
    if (out.length >= 20) break;
  }
  return out;
}

function parseGuestIdentity(payload) {
  const cpfHashes = collectHashes(payload);
  const emails = collectEmails(payload);
  if (!cpfHashes.length && !emails.length) return null;
  return {
    cpfHash: cpfHashes[0] || null,
    email: emails[0] || null,
    cpfHashes,
    emails,
  };
}

function requirePesquisasGuest(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ mensagem: 'Confirme sua identidade para continuar.' });
  }
  try {
    const payload = jwtService.verifyAccess(header.slice(7));
    if (payload.typ !== 'pesquisas_guest') {
      return res.status(401).json({ mensagem: 'Token inválido ou expirado.' });
    }
    const identity = parseGuestIdentity(payload);
    if (!identity) {
      return res.status(401).json({ mensagem: 'Token inválido ou expirado.' });
    }
    req.guest = identity;
    next();
  } catch {
    return res.status(401).json({ mensagem: 'Token inválido ou expirado.' });
  }
}

function optionalPesquisasGuest(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    req.guest = null;
    return next();
  }
  return requirePesquisasGuest(req, res, next);
}

module.exports = { requirePesquisasGuest, optionalPesquisasGuest };
