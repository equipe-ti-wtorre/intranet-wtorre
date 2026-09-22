const fs = require('fs');
const nscService = require('../services/nsc.service');
const nscAcesso = require('../services/nsc-acesso.service');
const graphService = require('../services/graph.service');
const tenantsRepo = require('../repositories/tenants.repository');
const auditRepo = require('../repositories/auditLog.repository');
const { sanitizeFilename } = require('../config/nsc-upload');

function auditMeta(req) {
  return {
    userId: req.user?.id,
    email: req.user?.email,
    requestId: req.requestId,
    ip: req.ip,
  };
}

function handleError(res, err) {
  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ mensagem: 'Registro já existente.' });
  }
  const status = err.status || 500;
  if (status >= 500) {
    console.error('[nsc] erro interno:', err.message, err.stack);
  }
  return res.status(status).json({
    mensagem: err.message || 'Erro ao processar a certificação Não se Cale.',
  });
}

async function streamMiniatura(res, envio) {
  const thumbPath = await nscService.caminhoMiniatura(envio);
  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.setHeader('Content-Disposition', 'inline; filename="certificado-miniatura.jpg"');
  return fs.createReadStream(thumbPath).pipe(res);
}

function streamEnvio(res, envio, filePath, download) {
  const filename = sanitizeFilename(envio.nome_arquivo);
  res.setHeader('Content-Type', envio.mime || 'application/octet-stream');
  res.setHeader(
    'Content-Disposition',
    `${download ? 'attachment' : 'inline'}; filename="${filename}"`
  );
  res.setHeader('Cache-Control', 'private, no-store');
  const stream = fs.createReadStream(filePath);
  stream.on('error', () => {
    if (!res.headersSent) {
      res.status(500).json({ mensagem: 'Erro ao ler arquivo.' });
    }
  });
  stream.pipe(res);
}

async function acesso(req, res) {
  try {
    const pode = await nscAcesso.usuarioPodeVisualizar(req.user, req.userModulos || []);
    return res.json({ pode_visualizar: pode });
  } catch (err) {
    return handleError(res, err);
  }
}

async function exigirVisualizacao(req, res, next) {
  try {
    const pode = await nscAcesso.usuarioPodeVisualizar(req.user, req.userModulos || []);
    if (!pode) {
      return res.status(403).json({ mensagem: 'Acesso restrito à certificação Não se Cale.' });
    }
    return next();
  } catch (err) {
    return handleError(res, err);
  }
}

async function meu(req, res) {
  try {
    return res.json(await nscService.meu(req.user));
  } catch (err) {
    return handleError(res, err);
  }
}

async function validar(req, res) {
  try {
    const result = await nscService.validarCertificado(req.user, req.file, req.body || {});
    return res.json(result);
  } catch (err) {
    return handleError(res, err);
  } finally {
    if (req.file?.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch {
        /* ignore */
      }
    }
  }
}

async function enviar(req, res) {
  try {
    const result = await nscService.enviarCertificado(req.user, req.file, req.body || {});
    await auditRepo.log({ ...auditMeta(req), action: 'NSC_ENVIO_CERTIFICADO' });
    return res.status(201).json(result);
  } catch (err) {
    if (req.file?.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch {
        /* ignore */
      }
    }
    return handleError(res, err);
  }
}

async function removerMeu(req, res) {
  try {
    const result = await nscService.removerMeuCertificado(req.user, req.query.envioId);
    await auditRepo.log({ ...auditMeta(req), action: 'NSC_REMOVER_CERTIFICADO' });
    return res.json(result);
  } catch (err) {
    return handleError(res, err);
  }
}

async function removerAdmin(req, res) {
  try {
    const result = await nscService.removerCertificadoAdmin(
      req.params.adObjectId,
      req.query.envioId
    );
    await auditRepo.log({ ...auditMeta(req), action: 'NSC_REMOVER_CERTIFICADO_ADMIN' });
    return res.json(result);
  } catch (err) {
    return handleError(res, err);
  }
}

async function meuCertificado(req, res) {
  try {
    if (!req.user?.microsoft_id) {
      return res.status(400).json({ mensagem: 'Usuário sem identidade do Active Directory.' });
    }
    const envio = await nscService.obterEnvioParaServir(
      req.user.microsoft_id,
      req.query.envioId
    );
    if (req.query.miniatura === '1') {
      return streamMiniatura(res, envio);
    }
    const filePath = nscService.caminhoAbsoluto(envio);
    return streamEnvio(res, envio, filePath, req.query.download === '1');
  } catch (err) {
    return handleError(res, err);
  }
}

async function equipeCertificado(req, res) {
  try {
    const adObjectId = req.params.adObjectId;
    if (!req.user?.microsoft_id) {
      return res.status(403).json({ mensagem: 'Acesso restrito ao gestor direto.' });
    }
    const snap = await nscService.resolverPorAdId(adObjectId);
    if (!snap) {
      return res.status(404).json({ mensagem: 'Colaborador não encontrado.' });
    }
    if (!snap.tenant_id) {
      return res.status(403).json({ mensagem: 'Não foi possível validar o vínculo de gestão.' });
    }
    const tenant = await tenantsRepo.findById(snap.tenant_id);
    const manager = tenant
      ? await graphService.getUserManager(tenant, adObjectId)
      : null;
    const isGestor =
      manager?.ad_id &&
      String(manager.ad_id).toLowerCase() === String(req.user.microsoft_id).toLowerCase();
    if (!isGestor) {
      return res.status(403).json({ mensagem: 'Acesso restrito ao gestor direto.' });
    }
    const envio = await nscService.obterEnvioParaServir(adObjectId, req.query.envioId);
    if (req.query.miniatura === '1') {
      return streamMiniatura(res, envio);
    }
    const filePath = nscService.caminhoAbsoluto(envio);
    return streamEnvio(res, envio, filePath, req.query.download === '1');
  } catch (err) {
    return handleError(res, err);
  }
}

async function listarAdmin(req, res) {
  try {
    const colaboradores = await nscService.listarColaboradores(req.query);
    return res.json({ colaboradores });
  } catch (err) {
    return handleError(res, err);
  }
}

async function patchColaborador(req, res) {
  try {
    const result = await nscService.patchColaborador(
      req.params.adObjectId,
      req.body || {},
      req.user
    );
    await auditRepo.log({ ...auditMeta(req), action: 'NSC_OVERRIDE_OBRIGATORIO' });
    return res.json(result);
  } catch (err) {
    return handleError(res, err);
  }
}

async function patchColaboradoresLote(req, res) {
  try {
    const result = await nscService.patchColaboradoresLote(req.body || {}, req.user);
    await auditRepo.log({
      ...auditMeta(req),
      action: 'NSC_OVERRIDE_OBRIGATORIO_LOTE',
    });
    return res.json(result);
  } catch (err) {
    return handleError(res, err);
  }
}

async function certificadoAdmin(req, res) {
  try {
    const adObjectId = req.params.adObjectId;
    if (req.query.miniatura === '1') {
      const envio = await nscService.obterEnvioParaServir(adObjectId, req.query.envioId);
      return streamMiniatura(res, envio);
    }
    if (req.query.download === '1' || req.query.arquivo === '1') {
      const envio = await nscService.obterEnvioParaServir(adObjectId, req.query.envioId);
      const filePath = nscService.caminhoAbsoluto(envio);
      return streamEnvio(res, envio, filePath, req.query.download === '1');
    }
    return res.json(await nscService.detalheCertificado(adObjectId));
  } catch (err) {
    return handleError(res, err);
  }
}

async function getRegras(req, res) {
  try {
    return res.json({ regras: await nscService.regrasDepartamento() });
  } catch (err) {
    return handleError(res, err);
  }
}

async function putRegras(req, res) {
  try {
    const regras = await nscService.salvarRegrasDepartamento(req.body || {});
    await auditRepo.log({ ...auditMeta(req), action: 'NSC_REGRAS_DEPARTAMENTO' });
    return res.json({ regras });
  } catch (err) {
    return handleError(res, err);
  }
}

async function putGestoresDepartamento(req, res) {
  try {
    const regras = await nscService.salvarGestoresDepartamento(req.body || {});
    await auditRepo.log({ ...auditMeta(req), action: 'NSC_DEPARTAMENTO_GESTORES' });
    return res.json({ regras });
  } catch (err) {
    return handleError(res, err);
  }
}

async function getConfig(req, res) {
  try {
    return res.json(await nscService.getConfig());
  } catch (err) {
    return handleError(res, err);
  }
}

async function putConfig(req, res) {
  try {
    const config = await nscService.salvarConfig(req.body || {});
    await auditRepo.log({ ...auditMeta(req), action: 'NSC_CONFIG' });
    return res.json(config);
  } catch (err) {
    return handleError(res, err);
  }
}

async function getResumo(req, res) {
  try {
    return res.json(await nscService.resumo(req.query));
  } catch (err) {
    return handleError(res, err);
  }
}

async function exportarRelatorioXlsx(req, res) {
  try {
    const { buffer, filename } = await nscService.exportarRelatorioXlsx(req.query);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(buffer);
  } catch (err) {
    return handleError(res, err);
  }
}

async function listarNotificacoes(req, res) {
  try {
    const notificacoes = await nscService.listarNotificacoes(req.query);
    return res.json({ notificacoes });
  } catch (err) {
    return handleError(res, err);
  }
}

async function listarAprovacoes(req, res) {
  try {
    return res.json(await nscService.listarAprovacoes(req.query));
  } catch (err) {
    return handleError(res, err);
  }
}

async function aprovar(req, res) {
  try {
    const envio = await nscService.aprovarCertificado(
      req.params.envioId,
      req.body || {},
      req.user
    );
    await auditRepo.log({ ...auditMeta(req), action: 'NSC_APROVAR_CERTIFICADO' });
    return res.json(envio);
  } catch (err) {
    return handleError(res, err);
  }
}

async function rejeitar(req, res) {
  try {
    const envio = await nscService.rejeitarCertificado(req.params.envioId, req.body || {}, req.user);
    await auditRepo.log({ ...auditMeta(req), action: 'NSC_REJEITAR_CERTIFICADO' });
    return res.json(envio);
  } catch (err) {
    return handleError(res, err);
  }
}

async function previewNotificacao(req, res) {
  try {
    const tipo = String(req.query.tipo || '').trim();
    const dias = req.query.dias != null && req.query.dias !== '' ? Number(req.query.dias) : undefined;
    return res.json(nscService.previewNotificacao(tipo, dias));
  } catch (err) {
    return handleError(res, err);
  }
}

module.exports = {
  acesso,
  exigirVisualizacao,
  meu,
  validar,
  enviar,
  removerMeu,
  removerAdmin,
  meuCertificado,
  equipeCertificado,
  listarAdmin,
  patchColaborador,
  patchColaboradoresLote,
  certificadoAdmin,
  getRegras,
  putRegras,
  putGestoresDepartamento,
  getConfig,
  putConfig,
  getResumo,
  exportarRelatorioXlsx,
  listarNotificacoes,
  previewNotificacao,
  listarAprovacoes,
  aprovar,
  rejeitar,
};
