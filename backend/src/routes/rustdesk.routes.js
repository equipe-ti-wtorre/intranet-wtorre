const { Router } = require('express');
const controller = require('../controllers/rustdesk.controller');
const requireJwt = require('../middleware/requireJwt.middleware');
const requireModulo = require('../middleware/requireModulo.middleware');
const {
  uploadRustdeskCsv,
  handleRustdeskCsvMulterError,
} = require('../config/rustdesk-csv-upload');

const router = Router();
const guard = [requireJwt, requireModulo('rustdesk')];

router.get('/resumo', ...guard, controller.resumo);
router.get('/metricas', ...guard, controller.metricas);
router.get('/instalador', ...guard, controller.baixarInstalador);
router.get('/sync-log', ...guard, controller.listarSyncLog);
router.post('/sincronizar', ...guard, controller.sincronizar);

router.get('/dispositivos', ...guard, controller.listarDispositivos);
router.post('/dispositivos', ...guard, controller.criarDispositivo);
router.post(
  '/dispositivos/csv',
  ...guard,
  uploadRustdeskCsv.single('arquivo'),
  handleRustdeskCsvMulterError,
  controller.importarCsv
);
router.get('/dispositivos/:id', ...guard, controller.obterDispositivo);
router.patch('/dispositivos/:id', ...guard, controller.atualizarDispositivo);
router.delete('/dispositivos/:id', ...guard, controller.excluirDispositivo);

router.get('/orfaos', ...guard, controller.listarOrfaos);
router.post('/orfaos/:rustdeskId/vincular', ...guard, controller.vincularOrfao);

module.exports = router;
