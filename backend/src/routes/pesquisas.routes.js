const { Router } = require('express');
const controller = require('../controllers/pesquisas.controller');
const requireJwt = require('../middleware/requireJwt.middleware');
const requireModulo = require('../middleware/requireModulo.middleware');
const {
  optionalPesquisasGuest,
} = require('../middleware/requirePesquisasGuest.middleware');
const rateLimitPesquisasPublico = require('../middleware/rateLimitPesquisasPublico.middleware');
const {
  uploadPesquisas,
  uploadPesquisasCapa,
  handlePesquisasMulterError,
} = require('../config/pesquisas-upload');

const router = Router();
const adminGuard = [requireJwt, requireModulo('pesquisas')];

router.get('/publico/:slug', rateLimitPesquisasPublico, controller.publicoMeta);
router.post('/publico/:slug/verificar', rateLimitPesquisasPublico, controller.publicoVerificar);
router.get(
  '/publico/:slug/formulario',
  rateLimitPesquisasPublico,
  optionalPesquisasGuest,
  controller.publicoFormulario
);
router.post(
  '/publico/:slug/respostas',
  rateLimitPesquisasPublico,
  optionalPesquisasGuest,
  controller.publicoResponder
);

router.get('/resumo', requireJwt, controller.resumo);
router.get('/departamentos', requireJwt, controller.departamentos);
router.get('/aprovadores', requireJwt, controller.buscarAprovadores);
router.get('/templates', requireJwt, controller.listTemplates);

router.get('/formularios', requireJwt, controller.listFormularios);
router.post('/formularios', requireJwt, controller.criarRascunho);
router.get('/formularios/:id/responder', requireJwt, controller.payloadResponder);
router.post('/formularios/:id/respostas', requireJwt, controller.enviarResposta);
router.get('/formularios/:id/resultados', requireJwt, controller.resultados);
router.get('/formularios/:id/minha-resposta', requireJwt, controller.minhaResposta);
router.post('/formularios/:id/publicar', requireJwt, controller.publicar);
router.post('/formularios/:id/despublicar', requireJwt, controller.despublicar);
router.post('/formularios/:id/evento', requireJwt, controller.atualizarEvento);
router.post(
  '/formularios/:id/capa',
  requireJwt,
  uploadPesquisasCapa.single('capa'),
  handlePesquisasMulterError,
  controller.uploadCapa
);
router.delete('/formularios/:id/capa', requireJwt, controller.removerCapa);
router.post('/formularios/:id/rascunho', requireJwt, controller.atualizarRascunho);
router.post('/formularios/:id/encerrar', requireJwt, controller.encerrar);
router.get('/formularios/:id', requireJwt, controller.getFormulario);
router.put('/formularios/:id', requireJwt, controller.atualizarRascunho);
router.delete('/formularios/:id', requireJwt, controller.excluirFormulario);

router.get('/requisicoes', requireJwt, controller.listRequisicoes);
router.post(
  '/requisicoes',
  requireJwt,
  uploadPesquisas.single('anexo'),
  handlePesquisasMulterError,
  controller.criarRequisicao
);
router.post('/requisicoes/:id/decidir', requireJwt, controller.decidirRequisicao);
router.get('/requisicoes/:id/anexo', requireJwt, controller.anexoRequisicao);
router.get('/requisicoes/:id', requireJwt, controller.getRequisicao);
router.delete('/requisicoes/:id', requireJwt, controller.excluirRequisicao);

router.get('/admin/formularios', ...adminGuard, controller.listAdminFormularios);
router.get('/admin/requisicoes', ...adminGuard, controller.listAdminRequisicoes);
router.post('/admin/formularios/:id/encerrar', ...adminGuard, controller.encerrar);
router.delete('/admin/formularios/:id', ...adminGuard, controller.excluirFormulario);
router.delete('/admin/requisicoes/:id', ...adminGuard, controller.excluirRequisicao);
router.get('/admin/templates', ...adminGuard, controller.listAdminTemplates);
router.post('/admin/templates', ...adminGuard, controller.criarTemplate);
router.put('/admin/templates/:id', ...adminGuard, controller.atualizarTemplate);
router.delete('/admin/templates/:id', ...adminGuard, controller.excluirTemplate);

module.exports = router;
