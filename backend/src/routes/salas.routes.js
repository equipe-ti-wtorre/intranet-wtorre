const { Router } = require('express');
const salasController = require('../controllers/salas.controller');
const requireJwt = require('../middleware/requireJwt.middleware');
const requireModulo = require('../middleware/requireModulo.middleware');
const {
  uploadSalasLogo,
  handleSalasLogoMulterError,
} = require('../config/salas-logo-upload');

const router = Router();
const adminGuard = [requireJwt, requireModulo('salas')];

router.get('/config', ...adminGuard, salasController.getConfig);
router.put('/config', ...adminGuard, salasController.putConfig);
router.post('/config/testar', ...adminGuard, salasController.testarConfig);

router.get('/admin/ui-config', ...adminGuard, salasController.getAdminUiConfig);
router.put('/admin/ui-config', ...adminGuard, salasController.putAdminUiConfig);
router.get('/admin/rooms', ...adminGuard, salasController.getAdminRooms);
router.get('/admin/logos', ...adminGuard, salasController.getAdminLogos);
router.post(
  '/admin/tabs/:tabId/logo',
  ...adminGuard,
  uploadSalasLogo.single('logo'),
  handleSalasLogoMulterError,
  salasController.postAdminLogo
);
router.delete('/admin/tabs/:tabId/logo', ...adminGuard, salasController.deleteAdminLogo);

router.get('/logos/:file', requireJwt, salasController.getLogo);

router.get('/ui-config', requireJwt, salasController.getUiConfig);
router.get('/rooms', requireJwt, salasController.getRooms);
router.post('/schedule', requireJwt, salasController.postSchedule);
router.post('/availability/preview', requireJwt, salasController.postPreview);
router.post('/book', requireJwt, salasController.postBook);
router.get('/bookings', requireJwt, salasController.getBookings);
router.get('/my-meetings', requireJwt, salasController.getMyMeetings);
router.delete('/bookings/:eventId', requireJwt, salasController.deleteBooking);
router.get('/directory/users', requireJwt, salasController.getDirectoryUsers);

module.exports = router;
