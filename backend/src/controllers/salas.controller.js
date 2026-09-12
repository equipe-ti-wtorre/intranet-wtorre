const salasService = require('../services/salas.service');
const salasConfigService = require('../services/salas-config.service');
const salasAdminService = require('../services/salas-admin.service');

function localidadeFromReq(req) {
  return req.query.localidade || req.headers['x-localidade'] || null;
}

function proxyError(res, err) {
  return res.status(err.status || 500).json({
    mensagem: err.message,
    ...(err.code ? { code: err.code } : {}),
  });
}

async function getUiConfig(_req, res) {
  try {
    const dados = await salasService.getUiConfig();
    return res.json(dados);
  } catch (err) {
    return proxyError(res, err);
  }
}

async function getRooms(req, res) {
  try {
    const dados = await salasService.getRooms(localidadeFromReq(req));
    return res.json(dados);
  } catch (err) {
    return proxyError(res, err);
  }
}

async function postSchedule(req, res) {
  try {
    const dados = await salasService.getSchedule(localidadeFromReq(req), req.body);
    return res.json(dados);
  } catch (err) {
    return proxyError(res, err);
  }
}

async function postPreview(req, res) {
  try {
    const dados = await salasService.previewAvailability(localidadeFromReq(req), req.body);
    return res.json(dados);
  } catch (err) {
    return proxyError(res, err);
  }
}

async function postBook(req, res) {
  try {
    const dados = await salasService.book(localidadeFromReq(req), req.user, req.body);
    return res.json(dados);
  } catch (err) {
    return proxyError(res, err);
  }
}

async function getBookings(req, res) {
  try {
    const { start, end } = req.query;
    const dados = await salasService.listBookings(localidadeFromReq(req), start, end);
    return res.json(dados);
  } catch (err) {
    return proxyError(res, err);
  }
}

async function getMyMeetings(req, res) {
  try {
    const { start, end } = req.query;
    const dados = await salasService.listMyMeetings(req.user, start, end);
    return res.json(dados);
  } catch (err) {
    return proxyError(res, err);
  }
}

async function deleteBooking(req, res) {
  try {
    const { eventId } = req.params;
    const { organizer, roomEmail, start, end, title } = req.query;
    await salasService.cancelBooking(localidadeFromReq(req), req.user, eventId, {
      organizer,
      roomEmail,
      start,
      end,
      title,
    });
    return res.status(204).send();
  } catch (err) {
    return proxyError(res, err);
  }
}

async function getDirectoryUsers(req, res) {
  try {
    const dados = await salasService.searchUsers(localidadeFromReq(req), req.query.query);
    return res.json(dados);
  } catch (err) {
    return proxyError(res, err);
  }
}

async function getConfig(_req, res) {
  try {
    const dados = await salasConfigService.getPublicConfig();
    return res.json(dados);
  } catch (err) {
    return proxyError(res, err);
  }
}

async function putConfig(req, res) {
  try {
    const dados = await salasConfigService.save(req.body);
    return res.json(dados);
  } catch (err) {
    return proxyError(res, err);
  }
}

async function testarConfig(req, res) {
  try {
    const dados = await salasConfigService.testConnection(req.body || {});
    return res.json(dados);
  } catch (err) {
    return proxyError(res, err);
  }
}

async function getAdminUiConfig(_req, res) {
  try {
    const dados = await salasAdminService.getAdminUiConfig();
    return res.json(dados);
  } catch (err) {
    return proxyError(res, err);
  }
}

async function putAdminUiConfig(req, res) {
  try {
    const dados = await salasAdminService.saveAdminUiConfig(req.body);
    return res.json(dados);
  } catch (err) {
    return proxyError(res, err);
  }
}

async function getAdminRooms(_req, res) {
  try {
    const dados = await salasAdminService.getAdminRooms();
    return res.json(dados);
  } catch (err) {
    return proxyError(res, err);
  }
}

async function getAdminLogos(_req, res) {
  try {
    const dados = await salasAdminService.listRegisteredLogos();
    return res.json(dados);
  } catch (err) {
    return proxyError(res, err);
  }
}

async function postAdminLogo(req, res) {
  try {
    const { tabId } = req.params;
    if (!req.file) {
      return res.status(400).json({ mensagem: 'Arquivo de logo é obrigatório.' });
    }
    const dados = await salasAdminService.uploadTabLogo(tabId, req.file);
    return res.json(dados);
  } catch (err) {
    return proxyError(res, err);
  }
}

async function deleteAdminLogo(req, res) {
  try {
    const { tabId } = req.params;
    const dados = await salasAdminService.deleteTabLogo(tabId);
    return res.json(dados);
  } catch (err) {
    return proxyError(res, err);
  }
}

async function getLogo(req, res) {
  try {
    const { file } = req.params;
    const { buffer, contentType } = await salasAdminService.proxyLogo(file);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.send(buffer);
  } catch (err) {
    return proxyError(res, err);
  }
}

module.exports = {
  getUiConfig,
  getRooms,
  postSchedule,
  postPreview,
  postBook,
  getBookings,
  getMyMeetings,
  deleteBooking,
  getDirectoryUsers,
  getConfig,
  putConfig,
  testarConfig,
  getAdminUiConfig,
  putAdminUiConfig,
  getAdminRooms,
  getAdminLogos,
  postAdminLogo,
  deleteAdminLogo,
  getLogo,
};
