const jwtService = require('../services/jwt.service');
const usuariosRepo = require('../repositories/tablet-usuarios.repository');

async function requireTabletJwt(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ mensagem: 'Token não fornecido.' });
  }

  const token = header.slice(7);
  try {
    const payload = jwtService.verifyAccess(token);
    if (payload.typ !== 'tablet') {
      return res.status(401).json({ mensagem: 'Token inválido para o portal Tablet.' });
    }
    const user = await usuariosRepo.findById(payload.sub);
    if (!user || !user.ativo) {
      return res.status(401).json({ mensagem: 'Usuário inválido ou inativo.' });
    }
    req.tabletUser = user;
    req.jwtPayload = payload;
    next();
  } catch {
    return res.status(401).json({ mensagem: 'Token inválido ou expirado.' });
  }
}

function requireTabletAdmin(req, res, next) {
  if (!req.tabletUser || req.tabletUser.perfil !== 'ADMIN') {
    return res.status(403).json({ mensagem: 'Acesso restrito a administradores.' });
  }
  next();
}

module.exports = requireTabletJwt;
module.exports.requireTabletAdmin = requireTabletAdmin;
