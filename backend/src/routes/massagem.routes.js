const { Router } = require('express');
const controller = require('../controllers/massagem.controller');
const requireJwt = require('../middleware/requireJwt.middleware');
const requireModulo = require('../middleware/requireModulo.middleware');

const router = Router();
const adminGuard = [requireJwt, requireModulo('massagem')];

router.get('/layout', requireJwt, controller.getLayout);
router.put('/layout', ...adminGuard, controller.saveLayout);

router.get('/config', ...adminGuard, controller.getConfig);
router.put('/config', ...adminGuard, controller.saveConfig);

router.get('/punicao', requireJwt, controller.getPunicaoMe);
router.get('/admin/punicoes', ...adminGuard, controller.listPunicoesAdmin);

router.get('/admin/email-templates/meta', ...adminGuard, controller.getEmailTemplateMeta);
router.post('/admin/email-templates/preview', ...adminGuard, controller.previewEmailTemplate);
router.get('/admin/email-templates', ...adminGuard, controller.listEmailTemplates);
router.get('/admin/email-templates/:id', ...adminGuard, controller.getEmailTemplate);
router.post('/admin/email-templates', ...adminGuard, controller.createEmailTemplate);
router.put('/admin/email-templates/:id', ...adminGuard, controller.updateEmailTemplate);
router.delete('/admin/email-templates/:id', ...adminGuard, controller.removeEmailTemplate);

router.get('/admin/envios', ...adminGuard, controller.listEmailEnvios);
router.get('/admin/listas', ...adminGuard, controller.listListas);
router.post('/admin/listas', ...adminGuard, controller.createLista);
router.get('/admin/listas/:id/itens', ...adminGuard, controller.listListaItens);
router.post('/admin/listas/:id/itens', ...adminGuard, controller.addListaItem);
router.delete('/admin/listas/:id/itens/:itemId', ...adminGuard, controller.removeListaItem);
router.get('/admin/listas/:id', ...adminGuard, controller.getLista);
router.put('/admin/listas/:id', ...adminGuard, controller.updateLista);
router.delete('/admin/listas/:id', ...adminGuard, controller.removeLista);

router.get('/empresas', requireJwt, controller.listEmpresasPublic);
router.get('/admin/empresas', ...adminGuard, controller.listEmpresasAdmin);
router.post('/admin/empresas', ...adminGuard, controller.createEmpresa);
router.put('/admin/empresas/:id', ...adminGuard, controller.updateEmpresa);
router.delete('/admin/empresas/:id', ...adminGuard, controller.removeEmpresa);

router.get('/eventos', requireJwt, controller.listEventos);
router.post('/eventos', ...adminGuard, controller.createEvento);
router.put('/eventos/:id', ...adminGuard, controller.updateEvento);
router.delete('/eventos/:id', ...adminGuard, controller.removeEvento);
router.post('/eventos/:id/disparar', ...adminGuard, controller.dispararEvento);

router.get('/reservas/minhas', requireJwt, controller.minhasReservas);
router.get('/reservas', requireJwt, controller.listSlots);
router.post('/reservas', requireJwt, controller.createReserva);
router.put('/reservas/:chave/trocar', requireJwt, controller.trocarReserva);
router.delete('/reservas/:chave', requireJwt, controller.cancelarReserva);

router.get('/fila', requireJwt, controller.listFila);
router.post('/fila', requireJwt, controller.entrarFila);
router.delete('/fila/:id', requireJwt, controller.sairFila);

router.get('/admin/dashboard', ...adminGuard, controller.dashboard);
router.get('/admin/reservas', ...adminGuard, controller.listReservasAdmin);
router.delete('/admin/reservas/:chave', ...adminGuard, controller.adminRemoverReserva);

module.exports = router;
