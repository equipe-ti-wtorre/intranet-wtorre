const jwtService = require('../services/jwt.service');
const usuariosRepo = require('../repositories/ramal-usuarios.repository');

async function requireRamalJwt(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ mensagem: 'Token não fornecido.' });
  }

  const token = header.slice(7);
  try {
    const payload = jwtService.verifyAccess(token);
    if (payload.typ !== 'ramal') {
      return res.status(401).json({ mensagem: 'Token inválido para o portal Ramal.' });
    }
    const user = await usuariosRepo.findById(payload.sub);
    if (!user || !user.ativo) {
      return res.status(401).json({ mensagem: 'Usuário inválido ou inativo.' });
    }
    req.ramalUser = user;
    req.jwtPayload = payload;
    next();
  } catch {
    return res.status(401).json({ mensagem: 'Token inválido ou expirado.' });
  }
}

function requireRamalAdmin(req, res, next) {
  if (!req.ramalUser || req.ramalUser.perfil !== 'ADMIN') {
    return res.status(403).json({ mensagem: 'Acesso restrito a administradores.' });
  }
  next();
}

module.exports = requireRamalJwt;
module.exports.requireRamalAdmin = requireRamalAdmin;
