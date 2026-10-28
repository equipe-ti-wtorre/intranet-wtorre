const service = require('../services/pesquisas.service');
const auditRepo = require('../repositories/auditLog.repository');
const pesquisasBlobLocal = require('../services/pesquisas-blob-local');

function auditMeta(req) {
  return {
    userId: req.user?.id,
    requestId: req.requestId,
    ip: req.ip,
    email: req.user?.email,
  };
}

function handleError(res, err, req, meta) {
  if (req && meta?.acao && !err?.pesquisasErroRegistrado) {
    void service.registrarErro(req, err, {
      acao: meta.acao,
      passo: meta.passo || null,
      formularioId: meta.formularioId,
    });
  }
  if (err.status && err.message) {
    return res.status(err.status).json({ mensagem: err.message });
  }
  console.error('[pesquisas]', err.code || err.name, err.message);
  return res.status(500).json({ mensagem: 'Erro ao processar os formulários.' });
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

async function listDestinatarios(req, res) {
  try {
    res.json(await service.listDestinatariosCandidatos());
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

async function clonar(req, res) {
  try {
    const form = await service.clonarFormulario(req);
    try {
      await auditRepo.log({ ...auditMeta(req), action: 'PESQUISAS_FORMULARIO_CLONAR' });
    } catch (auditErr) {
      console.error(
        '[pesquisas] falha ao gravar auditoria de clone',
        auditErr.code || auditErr.name,
        auditErr.message
      );
    }
    res.status(201).json(form);
  } catch (err) {
    handleError(res, err, req, { acao: 'clonar', passo: 'clonarFormulario' });
  }
}

async function criarRascunho(req, res) {
  try {
    res.status(201).json(await service.salvarRascunho(req));
  } catch (err) {
    handleError(res, err, req, { acao: 'salvar', passo: 'criarRascunho' });
  }
}

async function atualizarRascunho(req, res) {
  try {
    res.json(await service.salvarRascunho(req));
  } catch (err) {
    handleError(res, err, req, { acao: 'salvar', passo: 'atualizarRascunho' });
  }
}

async function publicar(req, res) {
  try {
    const form = await service.publicarFormulario(req);
    await auditRepo.log({ ...auditMeta(req), action: 'PESQUISAS_FORMULARIO_PUBLICAR' });
    res.json(form);
  } catch (err) {
    handleError(res, err, req, { acao: 'publicar', passo: 'publicarFormulario' });
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

async function lookupBase(req, res) {
  try {
    res.json(await service.lookupBaseIntranet(req));
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
    handleError(res, err, req, { acao: 'responder', passo: 'enviarResposta' });
  }
}

async function resultados(req, res) {
  try {
    res.json(await service.resultados(req));
  } catch (err) {
    handleError(res, err);
  }
}

async function zipAnexos(req, res) {
  try {
    const { buffer, filename } = await service.zipAnexos(req);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    handleError(res, err);
  }
}

async function adicionarConvidado(req, res) {
  try {
    res.status(201).json(await service.adicionarConvidado(req));
  } catch (err) {
    handleError(res, err);
  }
}

async function atualizarConvidado(req, res) {
  try {
    res.json(await service.atualizarConvidado(req));
  } catch (err) {
    handleError(res, err);
  }
}

async function removerConvidado(req, res) {
  try {
    res.json(await service.removerConvidado(req));
  } catch (err) {
    handleError(res, err);
  }
}

async function adicionarConvidadosLote(req, res) {
  try {
    res.status(201).json(await service.adicionarConvidadosLote(req));
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

async function publicoHubMeta(req, res) {
  try {
    res.json(await service.publicoHubMeta(req));
  } catch (err) {
    handleError(res, err);
  }
}

async function publicoHubVerificar(req, res) {
  try {
    res.json(await service.publicoHubVerificar(req));
  } catch (err) {
    handleError(res, err);
  }
}

async function publicoHubMinhas(req, res) {
  try {
    res.json(await service.publicoHubMinhas(req));
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

async function publicoMinhas(req, res) {
  try {
    res.json(await service.publicoMinhas(req));
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

async function publicoLookupBase(req, res) {
  try {
    res.json(await service.lookupBasePublico(req));
  } catch (err) {
    handleError(res, err);
  }
}

async function publicoResponder(req, res) {
  try {
    res.status(201).json(await service.publicoResponder(req));
  } catch (err) {
    handleError(res, err, req, { acao: 'responder', passo: 'publicoResponder' });
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

async function listAdminErros(req, res) {
  try {
    res.json(await service.listAdminErros(req));
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

async function localBlob(req, res) {
  if (!pesquisasBlobLocal.ativo()) {
    return res.status(404).json({ mensagem: 'Rota não encontrada.' });
  }
  try {
    const file = await pesquisasBlobLocal.ler(req.params.blob);
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    return res.send(file.buffer);
  } catch (err) {
    handleError(res, err);
  }
}

async function uploadCapa(req, res) {
  try {
    res.json(await service.uploadCapa(req));
  } catch (err) {
    handleError(res, err, req, { acao: 'capa', passo: 'uploadCapa' });
  }
}

async function removerCapa(req, res) {
  try {
    res.json(await service.removerCapa(req));
  } catch (err) {
    handleError(res, err);
  }
}

async function publicoCarrossel(req, res) {
  try {
    res.json(await service.listPublicoCarrossel());
  } catch (err) {
    handleError(res, err);
  }
}

async function listAdminCarrossel(req, res) {
  try {
    res.json(await service.listAdminCarrossel(req));
  } catch (err) {
    handleError(res, err);
  }
}

async function criarCarrossel(req, res) {
  try {
    const rec = await service.criarPortalSlide(req);
    await auditRepo.log({ ...auditMeta(req), action: 'PESQUISAS_CARROSSEL_CRIAR' });
    res.status(201).json(rec);
  } catch (err) {
    handleError(res, err);
  }
}

async function atualizarCarrossel(req, res) {
  try {
    const rec = await service.atualizarPortalSlide(req);
    await auditRepo.log({ ...auditMeta(req), action: 'PESQUISAS_CARROSSEL_ATUALIZAR' });
    res.json(rec);
  } catch (err) {
    handleError(res, err);
  }
}

async function excluirCarrossel(req, res) {
  try {
    const out = await service.excluirPortalSlide(req);
    await auditRepo.log({ ...auditMeta(req), action: 'PESQUISAS_CARROSSEL_EXCLUIR' });
    res.json(out);
  } catch (err) {
    handleError(res, err);
  }
}

async function moverCarrossel(req, res) {
  try {
    res.json(await service.moverPortalSlide(req));
  } catch (err) {
    handleError(res, err);
  }
}

module.exports = {
  resumo,
  departamentos,
  listDestinatarios,
  buscarAprovadores,
  listFormularios,
  getFormulario,
  clonar,
  criarRascunho,
  atualizarRascunho,
  publicar,
  encerrar,
  excluirFormulario,
  payloadResponder,
  lookupBase,
  enviarResposta,
  resultados,
  zipAnexos,
  adicionarConvidado,
  atualizarConvidado,
  removerConvidado,
  adicionarConvidadosLote,
  minhaResposta,
  despublicar,
  atualizarEvento,
  publicoMeta,
  publicoHubMeta,
  publicoVerificar,
  publicoHubVerificar,
  publicoMinhas,
  publicoHubMinhas,
  publicoFormulario,
  publicoLookupBase,
  publicoResponder,
  listRequisicoes,
  getRequisicao,
  criarRequisicao,
  decidirRequisicao,
  anexoRequisicao,
  excluirRequisicao,
  listAdminErros,
  listAdminFormularios,
  listAdminRequisicoes,
  listTemplates,
  listAdminTemplates,
  criarTemplate,
  atualizarTemplate,
  excluirTemplate,
  localBlob,
  uploadCapa,
  removerCapa,
  publicoCarrossel,
  listAdminCarrossel,
  criarCarrossel,
  atualizarCarrossel,
  excluirCarrossel,
  moverCarrossel,
};
