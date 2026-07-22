const { Router } = require('express');
const controller = require('../controllers/eventos.controller');
const requireJwt = require('../middleware/requireJwt.middleware');
const requireModulo = require('../middleware/requireModulo.middleware');
const {
  uploadFonteLogo,
  handleMulterError,
} = require('../config/eventos-fontes-logo-upload');

const router = Router();

router.get('/proximos', requireJwt, controller.listarProximos);
router.get('/agenda', requireJwt, controller.listarAgenda);
router.get('/parsers', requireJwt, requireModulo('eventos'), controller.listarParsers);
router.get('/fontes/admin', requireJwt, requireModulo('eventos'), controller.listarFontesAdmin);
router.get('/fontes/logos/:filename', controller.serveLogoFile);
router.post(
  '/fontes/upload-logo',
  requireJwt,
  requireModulo('eventos'),
  uploadFonteLogo.single('imagem'),
  handleMulterError,
  controller.uploadLogo
);
router.post('/fontes', requireJwt, requireModulo('eventos'), controller.criarFonte);
router.post('/fontes/:id/testar', requireJwt, requireModulo('eventos'), controller.testarFonte);
router.get('/fontes/:id', requireJwt, requireModulo('eventos'), controller.obterFonte);
router.put('/fontes/:id', requireJwt, requireModulo('eventos'), controller.atualizarFonte);
router.delete('/fontes/:id', requireJwt, requireModulo('eventos'), controller.removerFonte);

module.exports = router;
