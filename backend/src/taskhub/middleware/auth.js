const jwt = require('jsonwebtoken');
const { query } = require('../db');
const { has } = require('../lib/permissions');

const { PROFILE_SQL } = require('../lib/permissions');

const USER_FIELDS = `id, name, email, username, initials, color, role, active, is_director, sector_id, directed_sectors,
  must_change_password, daily_capacity_min, job_title, token_version, away_until, profiles, permissions, directed_teams,
  avatar_rev,
  (SELECT MIN(team_id) FROM team_members WHERE user_id = users.id) AS team_id,
  (SELECT JSON_ARRAYAGG(team_id) FROM team_members WHERE user_id = users.id) AS team_ids,
  ${PROFILE_SQL('users')}`;

// Valida o token e carrega o usuário atualizado do banco a cada requisição,
// para que desativação, troca de papel e "sair de todas as sessões" valham na hora.
async function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Sessão não encontrada. Entre novamente.' });
  }
  let payload;
  try {
    payload = jwt.verify(header.slice(7), process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ message: 'Sessão expirada', code: 'TOKEN_EXPIRED' });
  }
  try {
    const { rows } = await query(`SELECT ${USER_FIELDS} FROM users WHERE id = $1`, [payload.id]);
    const user = rows[0];
    if (!user || user.active === false || user.token_version !== payload.tv) {
      return res.status(401).json({ message: 'Sessão encerrada. Entre novamente.' });
    }
    user.is_manager = has(user, 'criar_corporativo');
    req.user = user;
    next();
  } catch (err) { next(err); }
}

// Bloqueia o uso do sistema até a senha temporária ser trocada.
function requirePasswordChanged(req, res, next) {
  if (req.user?.must_change_password) {
    return res.status(403).json({ message: 'Troque sua senha para continuar.', code: 'PASSWORD_CHANGE_REQUIRED' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!has(req.user, 'gerenciar_pessoas_todas')) {
    return res.status(403).json({ message: 'Acesso restrito a administradores' });
  }
  next();
}

// Exige um acesso (perfil ou acesso extra).
const requirePerm = (...perms) => (req, res, next) => {
  if (!perms.some(p => has(req.user, p))) return res.status(403).json({ message: 'Você não tem acesso a esta área.' });
  next();
};

module.exports = { authenticate, requirePasswordChanged, requireAdmin, requirePerm, USER_FIELDS };
