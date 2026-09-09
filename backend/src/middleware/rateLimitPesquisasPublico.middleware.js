const rateLimit = require('express-rate-limit');

const rateLimitPesquisasPublico = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { mensagem: 'Muitas tentativas. Tente novamente mais tarde.' },
});

module.exports = rateLimitPesquisasPublico;
