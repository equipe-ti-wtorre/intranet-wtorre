const { Router } = require('express');
const requireJwt = require('../middleware/requireJwt.middleware');
const requireModulo = require('../middleware/requireModulo.middleware');
const controller = require('../controllers/nsc.controller');
const { uploadNsc, handleNscMulterError } = require('../config/nsc-upload');

const router = Router();
const adminGuard = [requireJwt, requireModulo('nao-se-cale')];
const viewerGuard = [requireJwt, controller.exigirVisualizacao];

router.get('/acesso', requireJwt, controller.acesso);

router.get('/meu', ...viewerGuard, controller.meu);
router.post(
  '/meu/validar',
  ...viewerGuard,
  uploadNsc.single('arquivo'),
  handleNscMulterError,
  controller.validar
);
router.post(
  '/meu/envio',
  ...viewerGuard,
  uploadNsc.single('arquivo'),
  handleNscMulterError,
  controller.enviar
);
router.get('/meu/certificado', ...viewerGuard, controller.meuCertificado);
router.delete('/meu/certificado', ...viewerGuard, controller.removerMeu);
router.get('/equipe', requireJwt, controller.listarEquipe);
router.get('/equipe/relatorio.xlsx', requireJwt, controller.exportarEquipeXlsx);
router.post('/equipe/lembretes', requireJwt, controller.lembrarEquipe);
router.post('/equipe/aprovacoes/:envioId/aprovar', requireJwt, controller.aprovarEquipe);
router.post('/equipe/aprovacoes/:envioId/rejeitar', requireJwt, controller.rejeitarEquipe);
router.get('/equipe/:adObjectId/certificado', requireJwt, controller.equipeCertificado);
router.get('/equipe/:adObjectId', requireJwt, controller.detalheEquipe);

router.get('/admin/aprovacoes', ...adminGuard, controller.listarAprovacoes);
router.post('/admin/aprovacoes/:envioId/aprovar', ...adminGuard, controller.aprovar);
router.post('/admin/aprovacoes/:envioId/rejeitar', ...adminGuard, controller.rejeitar);
router.get('/admin/resumo', ...adminGuard, controller.getResumo);
router.get('/admin/relatorio.xlsx', ...adminGuard, controller.exportarRelatorioXlsx);
router.get('/admin/notificacoes/preview', ...adminGuard, controller.previewNotificacao);
router.get('/admin/notificacoes', ...adminGuard, controller.listarNotificacoes);
router.get('/admin/config', ...adminGuard, controller.getConfig);
router.put('/admin/config', ...adminGuard, controller.putConfig);
router.get('/admin/regras-departamento', ...adminGuard, controller.getRegras);
router.put('/admin/regras-departamento', ...adminGuard, controller.putRegras);
router.put('/admin/departamentos/gestores', ...adminGuard, controller.putGestoresDepartamento);
router.get('/admin/colaboradores', ...adminGuard, controller.listarAdmin);
router.patch('/admin/colaboradores/lote', ...adminGuard, controller.patchColaboradoresLote);
router.patch('/admin/colaboradores/:adObjectId', ...adminGuard, controller.patchColaborador);
router.get(
  '/admin/colaboradores/:adObjectId/certificado',
  ...adminGuard,
  controller.certificadoAdmin
);
router.delete(
  '/admin/colaboradores/:adObjectId/certificado',
  ...adminGuard,
  controller.removerAdmin
);
router.get('/admin/visualizadores', ...adminGuard, controller.listarVisualizadores);
router.post('/admin/visualizadores', ...adminGuard, controller.criarVisualizador);
router.patch('/admin/visualizadores/:id', ...adminGuard, controller.atualizarVisualizador);
router.delete('/admin/visualizadores/:id', ...adminGuard, controller.removerVisualizador);
router.get('/admin/acesso-log', ...adminGuard, controller.listarAcessoLog);

module.exports = router;
