const jwtService = require('../services/jwt.service');

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
    const convidadoId = Number(payload.convidadoId);
    const formId = Number(payload.formId);
    if (!Number.isInteger(convidadoId) || convidadoId < 1 || !Number.isInteger(formId) || formId < 1) {
      return res.status(401).json({ mensagem: 'Token inválido ou expirado.' });
    }
    req.guest = {
      convidadoId,
      formId,
      slug: String(payload.slug || ''),
    };
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
