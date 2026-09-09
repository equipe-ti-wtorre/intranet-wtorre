const { Router } = require('express');
const controller = require('../controllers/ramal.controller');
const rateLimitAuth = require('../middleware/rateLimitAuth.middleware');
const requireRamalJwt = require('../middleware/requireRamalJwt.middleware');
const { requireRamalAdmin } = require('../middleware/requireRamalJwt.middleware');

const router = Router();

router.post('/auth/login', rateLimitAuth, controller.login);
router.post('/auth/refresh', controller.refresh);
router.post('/auth/logout', requireRamalJwt, controller.logout);
router.get('/auth/me', requireRamalJwt, controller.me);

router.get('/diretorio', requireRamalJwt, controller.diretorio);
router.get('/departamentos', requireRamalJwt, controller.departamentos);

router.get('/usuarios', requireRamalJwt, requireRamalAdmin, controller.listUsuarios);
router.post('/usuarios', requireRamalJwt, requireRamalAdmin, controller.createUsuario);
router.put('/usuarios/:id', requireRamalJwt, requireRamalAdmin, controller.updateUsuario);
router.patch('/usuarios/:id/senha', requireRamalJwt, requireRamalAdmin, controller.alterarSenha);
router.delete('/usuarios/:id', requireRamalJwt, requireRamalAdmin, controller.excluirUsuario);

module.exports = router;
