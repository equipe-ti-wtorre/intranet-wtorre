const { Router } = require('express');
const controller = require('../controllers/tablet.controller');
const rateLimitAuth = require('../middleware/rateLimitAuth.middleware');
const requireTabletJwt = require('../middleware/requireTabletJwt.middleware');
const { requireTabletAdmin } = require('../middleware/requireTabletJwt.middleware');

const router = Router();

router.post('/auth/login', rateLimitAuth, controller.login);
router.post('/auth/refresh', controller.refresh);
router.post('/auth/logout', requireTabletJwt, controller.logout);
router.get('/auth/me', requireTabletJwt, controller.me);

router.get('/empresas', requireTabletJwt, requireTabletAdmin, controller.listEmpresas);

router.get('/usuarios', requireTabletJwt, requireTabletAdmin, controller.listUsuarios);
router.post('/usuarios', requireTabletJwt, requireTabletAdmin, controller.createUsuario);
router.put('/usuarios/:id', requireTabletJwt, requireTabletAdmin, controller.updateUsuario);
router.patch('/usuarios/:id/senha', requireTabletJwt, requireTabletAdmin, controller.alterarSenha);
router.delete('/usuarios/:id', requireTabletJwt, requireTabletAdmin, controller.excluirUsuario);

router.get('/eventos', requireTabletJwt, controller.listEventos);
router.get('/lista-dia/:eventoId/:data', requireTabletJwt, controller.listaDia);
router.post('/presenca/:chave', requireTabletJwt, controller.presenca);

module.exports = router;
