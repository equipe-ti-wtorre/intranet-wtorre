const jwtService = require('../services/jwt.service');
const usersRepo = require('../repositories/users.repository');
const permissoesService = require('../services/permissoes.service');

async function optionalJwt(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    req.user = null;
    req.userModulos = [];
    return next();
  }

  const token = header.slice(7);
  try {
    const payload = jwtService.verifyAccess(token);
    const user = await usersRepo.findById(payload.sub);
    if (!user || !user.ativo) {
      return res.status(401).json({ mensagem: 'Usuário inválido ou inativo.' });
    }
    req.user = user;
    req.jwtPayload = payload;
    req.userModulos = await permissoesService.resolveModulos(user);
    return next();
  } catch {
    return res.status(401).json({ mensagem: 'Token inválido ou expirado.' });
  }
}

module.exports = optionalJwt;
