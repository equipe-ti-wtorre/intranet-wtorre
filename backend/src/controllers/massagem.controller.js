const service = require('../services/massagem.service');

function handleError(res, err) {
  const status = err.status || 500;
  return res.status(status).json({
    mensagem: err.message || 'Erro ao processar solicitação de massagem.',
  });
}

async function listEventos(req, res) {
  try {
    res.json(await service.listEventos(req));
  } catch (err) {
    handleError(res, err);
  }
}

async function createEvento(req, res) {
  try {
    res.status(201).json(await service.createEvento(req.body));
  } catch (err) {
    handleError(res, err);
  }
}

async function updateEvento(req, res) {
  try {
    res.json(await service.updateEvento(req.params.id, req.body));
  } catch (err) {
    handleError(res, err);
  }
}

async function removeEvento(req, res) {
  try {
    res.json(await service.removeEvento(req.params.id));
  } catch (err) {
    handleError(res, err);
  }
}

async function dispararEvento(req, res) {
  try {
    res.json(await service.dispararEvento(req.params.id, req.body));
  } catch (err) {
    handleError(res, err);
  }
}

async function listSlots(req, res) {
  try {
    res.json(await service.listSlots(req));
  } catch (err) {
    handleError(res, err);
  }
}

async function createReserva(req, res) {
  try {
    res.status(201).json(await service.createReserva(req));
  } catch (err) {
    handleError(res, err);
  }
}

async function trocarReserva(req, res) {
  try {
    res.json(await service.trocarReserva(req));
  } catch (err) {
    handleError(res, err);
  }
}

async function cancelarReserva(req, res) {
  try {
    res.json(await service.cancelarReserva(req));
  } catch (err) {
    handleError(res, err);
  }
}

async function minhasReservas(req, res) {
  try {
    res.json(await service.minhasReservas(req));
  } catch (err) {
    handleError(res, err);
  }
}

async function listFila(req, res) {
  try {
    res.json(await service.listFila(req.query.eventoId));
  } catch (err) {
    handleError(res, err);
  }
}

async function entrarFila(req, res) {
  try {
    res.status(201).json(await service.entrarFila(req));
  } catch (err) {
    handleError(res, err);
  }
}

async function sairFila(req, res) {
  try {
    res.json(await service.sairFila(req));
  } catch (err) {
    handleError(res, err);
  }
}

async function dashboard(req, res) {
  try {
    res.json(await service.dashboard());
  } catch (err) {
    handleError(res, err);
  }
}

async function listReservasAdmin(req, res) {
  try {
    res.json(await service.listReservasEvento(req.query.eventoId));
  } catch (err) {
    handleError(res, err);
  }
}

async function adminRemoverReserva(req, res) {
  try {
    res.json(await service.adminRemoverReserva(req.params.chave));
  } catch (err) {
    handleError(res, err);
  }
}

async function listEmpresasPublic(req, res) {
  try {
    res.json(await service.listEmpresasPublic());
  } catch (err) {
    handleError(res, err);
  }
}

async function listEmpresasAdmin(req, res) {
  try {
    res.json(await service.listEmpresasAdmin());
  } catch (err) {
    handleError(res, err);
  }
}

async function createEmpresa(req, res) {
  try {
    res.status(201).json(await service.createEmpresa(req.body));
  } catch (err) {
    handleError(res, err);
  }
}

async function updateEmpresa(req, res) {
  try {
    res.json(await service.updateEmpresa(req.params.id, req.body));
  } catch (err) {
    handleError(res, err);
  }
}

async function removeEmpresa(req, res) {
  try {
    res.json(await service.removeEmpresa(req.params.id));
  } catch (err) {
    handleError(res, err);
  }
}

async function getLayout(req, res) {
  try {
    res.json(await service.getLayout());
  } catch (err) {
    handleError(res, err);
  }
}

async function saveLayout(req, res) {
  try {
    res.json(await service.saveLayout(req.body));
  } catch (err) {
    handleError(res, err);
  }
}

async function getConfig(req, res) {
  try {
    res.json(await service.getConfig());
  } catch (err) {
    handleError(res, err);
  }
}

async function saveConfig(req, res) {
  try {
    res.json(await service.saveConfig(req.body));
  } catch (err) {
    handleError(res, err);
  }
}

async function getPunicaoMe(req, res) {
  try {
    res.json(await service.getPunicaoMe(req));
  } catch (err) {
    handleError(res, err);
  }
}

async function listPunicoesAdmin(req, res) {
  try {
    res.json(await service.listPunicoesAdmin());
  } catch (err) {
    handleError(res, err);
  }
}

async function listEmailTemplates(req, res) {
  try {
    res.json(await service.listEmailTemplates());
  } catch (err) {
    handleError(res, err);
  }
}

async function getEmailTemplateMeta(req, res) {
  try {
    res.json(service.templateMeta());
  } catch (err) {
    handleError(res, err);
  }
}

async function getEmailTemplate(req, res) {
  try {
    res.json(await service.getEmailTemplate(req.params.id));
  } catch (err) {
    handleError(res, err);
  }
}

async function createEmailTemplate(req, res) {
  try {
    res.status(201).json(await service.createEmailTemplate(req.body));
  } catch (err) {
    handleError(res, err);
  }
}

async function updateEmailTemplate(req, res) {
  try {
    res.json(await service.updateEmailTemplate(req.params.id, req.body));
  } catch (err) {
    handleError(res, err);
  }
}

async function removeEmailTemplate(req, res) {
  try {
    res.json(await service.removeEmailTemplate(req.params.id));
  } catch (err) {
    handleError(res, err);
  }
}

async function previewEmailTemplate(req, res) {
  try {
    res.json(await service.previewEmailTemplate(req.body));
  } catch (err) {
    handleError(res, err);
  }
}

async function listListas(req, res) {
  try {
    res.json(await service.listListas());
  } catch (err) {
    handleError(res, err);
  }
}

async function getLista(req, res) {
  try {
    res.json(await service.getLista(req.params.id));
  } catch (err) {
    handleError(res, err);
  }
}

async function createLista(req, res) {
  try {
    res.status(201).json(await service.createLista(req.body));
  } catch (err) {
    handleError(res, err);
  }
}

async function updateLista(req, res) {
  try {
    res.json(await service.updateLista(req.params.id, req.body));
  } catch (err) {
    handleError(res, err);
  }
}

async function removeLista(req, res) {
  try {
    res.json(await service.removeLista(req.params.id));
  } catch (err) {
    handleError(res, err);
  }
}

async function listListaItens(req, res) {
  try {
    res.json(await service.listListaItens(req.params.id));
  } catch (err) {
    handleError(res, err);
  }
}

async function addListaItem(req, res) {
  try {
    res.status(201).json(await service.addListaItem(req.params.id, req.body));
  } catch (err) {
    handleError(res, err);
  }
}

async function removeListaItem(req, res) {
  try {
    res.json(await service.removeListaItem(req.params.id, req.params.itemId));
  } catch (err) {
    handleError(res, err);
  }
}

async function listEmailEnvios(req, res) {
  try {
    res.json(await service.listEmailEnvios(req.query));
  } catch (err) {
    handleError(res, err);
  }
}

module.exports = {
  listEventos,
  createEvento,
  updateEvento,
  removeEvento,
  dispararEvento,
  listSlots,
  createReserva,
  trocarReserva,
  cancelarReserva,
  minhasReservas,
  listFila,
  entrarFila,
  sairFila,
  dashboard,
  listReservasAdmin,
  adminRemoverReserva,
  listEmpresasPublic,
  listEmpresasAdmin,
  createEmpresa,
  updateEmpresa,
  removeEmpresa,
  getLayout,
  saveLayout,
  getConfig,
  saveConfig,
  getPunicaoMe,
  listPunicoesAdmin,
  listEmailTemplates,
  getEmailTemplateMeta,
  getEmailTemplate,
  createEmailTemplate,
  updateEmailTemplate,
  removeEmailTemplate,
  previewEmailTemplate,
  listListas,
  getLista,
  createLista,
  updateLista,
  removeLista,
  listListaItens,
  addListaItem,
  removeListaItem,
  listEmailEnvios,
};
