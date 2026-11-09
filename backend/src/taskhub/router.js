const express = require('express');
const { authenticate, requirePasswordChanged, requireAdmin } = require('./middleware/auth');
const { ah } = require('./lib/http');
const { tx } = require('./db');
const { ensurePersonalBoard } = require('./lib/boards');
const { adminStatus } = require('./lib/entra');
const { sendAvatar } = require('./lib/avatars');

const router = express.Router();

router.get('/avatars/:file', (req, res) => {
  const match = /^(\d+)\.jpg$/.exec(req.params.file);
  if (!match) return res.status(404).json({ message: 'Foto não encontrada' });
  sendAvatar(Number(match[1]), res);
});

router.use('/auth', require('./routes/auth'));

const api = express.Router();
api.use(authenticate, requirePasswordChanged);
api.use('/users', require('./routes/users'));
api.use(require('./routes/phases'));
api.use('/sectors', require('./routes/sectors'));
api.use('/teams', require('./routes/teams'));
api.use('/access-profiles', require('./routes/access-profiles'));
api.use(require('./routes/works'));
api.use(require('./routes/work-dashboard'));
api.use('/projects', require('./routes/projects'));
api.use('/tasks', require('./routes/tasks'));
api.get('/me/board', ah(async (req, res) => {
  const projectId = await tx((c) => ensurePersonalBoard(c, req.user.id));
  if (!projectId) return res.status(404).json({ message: 'Pessoa não encontrada' });
  res.json({ project_id: projectId });
}));
api.use('/me/day', require('./routes/day'));
api.use('/inbox', require('./routes/inbox'));
api.use('/dashboard', require('./routes/dashboard'));
api.use('/search', require('./routes/search'));
api.use('/routine', require('./routes/routine'));
api.use('/reminders', require('./routes/reminders'));
api.use('/notes', require('./routes/notes'));
api.get('/microsoft', requireAdmin, ah(async (req, res) => {
  res.json(await adminStatus(req));
}));
router.use(api);

router.use((_req, res) => res.status(404).json({ message: 'Rota não encontrada' }));

router.use((err, _req, res, _next) => {
  const status = err.status || 500;
  if (status >= 500) console.error('[taskhub]', err);
  res.status(status).json({
    message: status >= 500 ? 'Erro interno do servidor' : err.message,
    ...(status < 500 && err.extra ? (Array.isArray(err.extra) ? { details: err.extra } : err.extra) : {}),
  });
});

module.exports = router;
