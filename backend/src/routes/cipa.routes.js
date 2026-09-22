const { Router } = require('express');
const requireJwt = require('../middleware/requireJwt.middleware');
const optionalJwt = require('../middleware/optionalJwt.middleware');
const requireModulo = require('../middleware/requireModulo.middleware');
const controller = require('../controllers/cipa.controller');
const { uploadCipaImagem, handleCipaMulterError } = require('../config/cipa-upload');

const router = Router();
const adminGuard = [requireJwt, requireModulo('agenda_rh')];

router.get('/eventos', requireJwt, controller.listarPublicos);
router.get('/eventos/:codigo/imagem', optionalJwt, controller.servirImagem);
router.get('/eventos/:codigo', optionalJwt, controller.obterPublico);
router.post('/eventos/:codigo/inscrever', optionalJwt, controller.inscrever);

router.get('/admin/eventos', ...adminGuard, controller.listarAdmin);
router.get('/admin/colaboradores', ...adminGuard, controller.buscarColaboradores);
router.get('/admin/eventos/:codigo/inscritos', ...adminGuard, controller.listarInscritos);
router.get('/admin/eventos/:codigo/export.xlsx', ...adminGuard, controller.exportarXlsx);
router.get('/admin/eventos/:codigo', ...adminGuard, controller.obterAdmin);
router.post(
  '/admin/eventos',
  ...adminGuard,
  uploadCipaImagem.single('imagem'),
  handleCipaMulterError,
  controller.criar
);
router.put(
  '/admin/eventos/:codigo',
  ...adminGuard,
  uploadCipaImagem.single('imagem'),
  handleCipaMulterError,
  controller.atualizar
);
router.delete('/admin/eventos/:codigo', ...adminGuard, controller.excluir);
router.delete(
  '/admin/eventos/:codigo/inscricoes/:inscricaoId',
  ...adminGuard,
  controller.excluirInscricao
);

module.exports = router;
