const { Router } = require('express');
const controller = require('../controllers/solicitacao-colaborador.controller');
const requireJwt = require('../middleware/requireJwt.middleware');
const requireModulo = require('../middleware/requireModulo.middleware');
const requireSolicitacaoViewer = require('../middleware/requireSolicitacaoViewer.middleware');
const {
  uploadSolicitacao,
  handleSolicitacaoMulterError,
} = require('../config/solicitacao-colaborador-upload');

const router = Router();
const adminGuard = [requireJwt, requireModulo('solicitacao-colaborador')];
const viewerGuard = [requireJwt, requireSolicitacaoViewer];

router.get('/acesso', requireJwt, controller.acesso);
router.get('/campos', ...viewerGuard, controller.campos);
router.get('/minhas', ...viewerGuard, controller.minhas);
router.post(
  '/',
  ...viewerGuard,
  uploadSolicitacao.fields([
    { name: 'foto', maxCount: 1 },
    { name: 'boas_vindas', maxCount: 1 },
    { name: 'credencial_veiculo', maxCount: 1 },
  ]),
  handleSolicitacaoMulterError,
  controller.criar
);

router.get('/admin/solicitacoes', ...adminGuard, controller.listarSolicitacoesAdmin);
router.get('/admin/solicitacoes/:id', ...adminGuard, controller.obterSolicitacaoAdmin);
router.get(
  '/admin/solicitacoes/:id/preview-individual/:emailId',
  ...adminGuard,
  controller.previewEmailIndividual
);
router.post(
  '/admin/solicitacoes/:id/reenviar-individual/:emailId',
  ...adminGuard,
  controller.reenviarEmailIndividual
);
router.get(
  '/admin/solicitacoes/:id/preview/:grupoId',
  ...adminGuard,
  controller.previewEmail
);
router.post(
  '/admin/solicitacoes/:id/reenviar/:grupoId',
  ...adminGuard,
  controller.reenviarEmail
);
router.post(
  '/admin/solicitacoes/:id/encaminhar',
  ...adminGuard,
  controller.encaminharEmail
);

router.post('/admin/preview-template', ...adminGuard, controller.previewTemplate);
router.post('/admin/enviar-teste', ...adminGuard, controller.enviarTeste);

router.get('/admin/grupos', ...adminGuard, controller.listarGrupos);
router.post('/admin/grupos', ...adminGuard, controller.criarGrupo);
router.put('/admin/grupos/:id', ...adminGuard, controller.atualizarGrupo);
router.delete('/admin/grupos/:id', ...adminGuard, controller.removerGrupo);

router.get('/admin/emails-individuais', ...adminGuard, controller.listarEmailsIndividuais);
router.post('/admin/emails-individuais', ...adminGuard, controller.criarEmailIndividual);
router.put('/admin/emails-individuais/:id', ...adminGuard, controller.atualizarEmailIndividual);
router.delete('/admin/emails-individuais/:id', ...adminGuard, controller.removerEmailIndividual);

router.get('/admin/usuarios-ad/buscar', ...adminGuard, controller.buscarUsuariosAd);

router.get('/admin/visualizadores', ...adminGuard, controller.listarVisualizadores);
router.post('/admin/visualizadores', ...adminGuard, controller.adicionarVisualizador);
router.delete('/admin/visualizadores/:usuarioId', ...adminGuard, controller.removerVisualizador);

module.exports = router;
