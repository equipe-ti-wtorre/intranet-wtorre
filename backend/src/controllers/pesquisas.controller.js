const service = require('../services/pesquisas.service');
const auditRepo = require('../repositories/auditLog.repository');

function auditMeta(req) {
  return {
    userId: req.user?.id,
    requestId: req.requestId,
    ip: req.ip,
    email: req.user?.email,
  };
}

function handleError(res, err) {
  return res.status(err.status || 500).json({
    mensagem: err.message || 'Erro ao processar a Central de Pesquisas.',
  });
}

async function resumo(req, res) {
  try {
    res.json(await service.resumo(req));
  } catch (err) {
    handleError(res, err);
  }
}

async function departamentos(req, res) {
  try {
    res.json(await service.departamentos());
  } catch (err) {
    handleError(res, err);
  }
}

async function buscarAprovadores(req, res) {
  try {
    res.json(await service.buscarAprovadores(req));
  } catch (err) {
    handleError(res, err);
  }
}

async function listFormularios(req, res) {
  try {
    res.json(await service.listFormularios(req));
  } catch (err) {
    handleError(res, err);
  }
}

async function getFormulario(req, res) {
  try {
    res.json(await service.getFormulario(req));
  } catch (err) {
    handleError(res, err);
  }
}

async function criarRascunho(req, res) {
  try {
    res.status(201).json(await service.salvarRascunho(req));
  } catch (err) {
    handleError(res, err);
  }
}

async function atualizarRascunho(req, res) {
  try {
    res.json(await service.salvarRascunho(req));
  } catch (err) {
    handleError(res, err);
  }
}

async function publicar(req, res) {
  try {
    const form = await service.publicarFormulario(req);
    await auditRepo.log({ ...auditMeta(req), action: 'PESQUISAS_FORMULARIO_PUBLICAR' });
    res.json(form);
  } catch (err) {
    handleError(res, err);
  }
}

async function encerrar(req, res) {
  try {
    const form = await service.encerrarFormulario(req);
    await auditRepo.log({ ...auditMeta(req), action: 'PESQUISAS_FORMULARIO_ENCERRAR' });
    res.json(form);
  } catch (err) {
    handleError(res, err);
  }
}

async function excluirFormulario(req, res) {
  try {
    const out = await service.excluirFormulario(req);
    await auditRepo.log({ ...auditMeta(req), action: 'PESQUISAS_FORMULARIO_EXCLUIR' });
    res.json(out);
  } catch (err) {
    handleError(res, err);
  }
}

async function payloadResponder(req, res) {
  try {
    res.json(await service.payloadResponder(req));
  } catch (err) {
    handleError(res, err);
  }
}

async function enviarResposta(req, res) {
  try {
    res.status(201).json(await service.enviarResposta(req));
  } catch (err) {
    handleError(res, err);
  }
}

async function resultados(req, res) {
  try {
    res.json(await service.resultados(req));
  } catch (err) {
    handleError(res, err);
  }
}

async function minhaResposta(req, res) {
  try {
    res.json(await service.minhaResposta(req));
  } catch (err) {
    handleError(res, err);
  }
}

async function despublicar(req, res) {
  try {
    const form = await service.despublicarFormulario(req);
    await auditRepo.log({ ...auditMeta(req), action: 'PESQUISAS_FORMULARIO_DESPUBLICAR' });
    res.json(form);
  } catch (err) {
    handleError(res, err);
  }
}

async function atualizarEvento(req, res) {
  try {
    res.json(await service.atualizarEvento(req));
  } catch (err) {
    handleError(res, err);
  }
}

async function publicoMeta(req, res) {
  try {
    res.json(await service.publicoMeta(req));
  } catch (err) {
    handleError(res, err);
  }
}

async function publicoVerificar(req, res) {
  try {
    res.json(await service.publicoVerificar(req));
  } catch (err) {
    handleError(res, err);
  }
}

async function publicoFormulario(req, res) {
  try {
    res.json(await service.publicoFormulario(req));
  } catch (err) {
    handleError(res, err);
  }
}

async function publicoResponder(req, res) {
  try {
    res.status(201).json(await service.publicoResponder(req));
  } catch (err) {
    handleError(res, err);
  }
}

async function listRequisicoes(req, res) {
  try {
    res.json(await service.listRequisicoes(req));
  } catch (err) {
    handleError(res, err);
  }
}

async function getRequisicao(req, res) {
  try {
    res.json(await service.getRequisicao(req));
  } catch (err) {
    handleError(res, err);
  }
}

async function criarRequisicao(req, res) {
  try {
    res.status(201).json(await service.criarRequisicao(req));
  } catch (err) {
    handleError(res, err);
  }
}

async function decidirRequisicao(req, res) {
  try {
    const rec = await service.decidirRequisicao(req);
    await auditRepo.log({ ...auditMeta(req), action: 'PESQUISAS_REQUISICAO_DECIDIR' });
    res.json(rec);
  } catch (err) {
    handleError(res, err);
  }
}

async function anexoRequisicao(req, res) {
  try {
    res.json(await service.anexoRequisicao(req));
  } catch (err) {
    handleError(res, err);
  }
}

async function excluirRequisicao(req, res) {
  try {
    const out = await service.excluirRequisicao(req);
    await auditRepo.log({ ...auditMeta(req), action: 'PESQUISAS_REQUISICAO_EXCLUIR' });
    res.json(out);
  } catch (err) {
    handleError(res, err);
  }
}

async function listAdminFormularios(req, res) {
  try {
    res.json(await service.listAdminFormularios(req));
  } catch (err) {
    handleError(res, err);
  }
}

async function listAdminRequisicoes(req, res) {
  try {
    res.json(await service.listAdminRequisicoes(req));
  } catch (err) {
    handleError(res, err);
  }
}

async function listTemplates(req, res) {
  try {
    res.json(await service.listTemplatesAtivos());
  } catch (err) {
    handleError(res, err);
  }
}

async function listAdminTemplates(req, res) {
  try {
    res.json(await service.listAdminTemplates(req));
  } catch (err) {
    handleError(res, err);
  }
}

async function criarTemplate(req, res) {
  try {
    const rec = await service.criarTemplate(req);
    await auditRepo.log({ ...auditMeta(req), action: 'PESQUISAS_TEMPLATE_CRIAR' });
    res.status(201).json(rec);
  } catch (err) {
    handleError(res, err);
  }
}

async function atualizarTemplate(req, res) {
  try {
    const rec = await service.atualizarTemplate(req);
    await auditRepo.log({ ...auditMeta(req), action: 'PESQUISAS_TEMPLATE_ATUALIZAR' });
    res.json(rec);
  } catch (err) {
    handleError(res, err);
  }
}

async function excluirTemplate(req, res) {
  try {
    const out = await service.excluirTemplate(req);
    await auditRepo.log({ ...auditMeta(req), action: 'PESQUISAS_TEMPLATE_EXCLUIR' });
    res.json(out);
  } catch (err) {
    handleError(res, err);
  }
}

async function uploadCapa(req, res) {
  try {
    res.json(await service.uploadCapa(req));
  } catch (err) {
    handleError(res, err);
  }
}

async function removerCapa(req, res) {
  try {
    res.json(await service.removerCapa(req));
  } catch (err) {
    handleError(res, err);
  }
}

module.exports = {
  resumo,
  departamentos,
  buscarAprovadores,
  listFormularios,
  getFormulario,
  criarRascunho,
  atualizarRascunho,
  publicar,
  encerrar,
  excluirFormulario,
  payloadResponder,
  enviarResposta,
  resultados,
  minhaResposta,
  despublicar,
  atualizarEvento,
  publicoMeta,
  publicoVerificar,
  publicoFormulario,
  publicoResponder,
  listRequisicoes,
  getRequisicao,
  criarRequisicao,
  decidirRequisicao,
  anexoRequisicao,
  excluirRequisicao,
  listAdminFormularios,
  listAdminRequisicoes,
  listTemplates,
  listAdminTemplates,
  criarTemplate,
  atualizarTemplate,
  excluirTemplate,
  uploadCapa,
  removerCapa,
};
