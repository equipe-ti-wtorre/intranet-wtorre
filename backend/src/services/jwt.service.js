const jwt = require('jsonwebtoken');
const { env } = require('../config/env');

function signAccess(payload) {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtAccessExpires });
}

function signRefresh(payload) {
  return jwt.sign({ ...payload, type: 'refresh' }, env.jwtSecret, {
    expiresIn: env.jwtRefreshExpires,
  });
}

function verifyAccess(token) {
  const payload = jwt.verify(token, env.jwtSecret);
  if (payload.type === 'refresh') {
    throw new Error('Token inválido');
  }
  return payload;
}

function verifyRefresh(token) {
  const payload = jwt.verify(token, env.jwtSecret);
  if (payload.type !== 'refresh') {
    throw new Error('Token inválido');
  }
  return payload;
}

function signPesquisasGuest(payload) {
  return jwt.sign({ ...payload, typ: 'pesquisas_guest' }, env.jwtSecret, { expiresIn: '8h' });
}

module.exports = { signAccess, signRefresh, verifyAccess, verifyRefresh, signPesquisasGuest };
