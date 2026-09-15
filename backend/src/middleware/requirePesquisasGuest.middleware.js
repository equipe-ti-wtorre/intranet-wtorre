const jwtService = require('../services/jwt.service');

function parseGuestIdentity(payload) {
  const rawHash = typeof payload.cpfHash === 'string' ? payload.cpfHash.trim().toLowerCase() : '';
  const cpfHash = /^[a-f0-9]{64}$/.test(rawHash) ? rawHash : null;
  const rawEmail = typeof payload.email === 'string' ? payload.email.trim().toLowerCase().slice(0, 200) : '';
  const email = rawEmail.includes('@') ? rawEmail : null;
  if (!cpfHash && !email) return null;
  return { cpfHash, email };
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
