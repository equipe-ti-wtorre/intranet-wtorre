const fs = require('fs');
const nscService = require('../services/nsc.service');
const nscAcesso = require('../services/nsc-acesso.service');
const nscPermissao = require('../services/nsc-permissao.service');
const nscNotificacoes = require('../services/nsc-notificacoes.service');
const nscRepo = require('../repositories/nsc.repository');
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
    return res.json(await nscPermissao.resolverAcesso(req.user, req.userModulos || []));
  } catch (err) {
    return handleError(res, err);
  }
}

async function acessoEquipe(req, flag) {
  const acesso = await nscPermissao.resolverAcesso(req.user, req.userModulos || []);
  nscPermissao.exigirPermissao(acesso, flag);
  return acesso;
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

async function listarEquipe(req, res) {
  try {
    const acesso = await acessoEquipe(req);
    return res.json(await nscService.listarEquipe(req.query, acesso));
  } catch (err) {
    return handleError(res, err);
  }
}

async function detalheEquipe(req, res) {
  try {
    const acesso = await acessoEquipe(req);
    const snap = await nscService.resolverPorAdId(req.params.adObjectId);
    if (!snap || !nscPermissao.colaboradorNoEscopo(snap, acesso)) {
      return res.status(404).json({ mensagem: 'Colaborador não encontrado no seu escopo.' });
    }
    return res.json(await nscService.detalheCertificado(req.params.adObjectId));
  } catch (err) {
    return handleError(res, err);
  }
}

async function equipeCertificado(req, res) {
  try {
    const acesso = await acessoEquipe(req, 'baixar');
    const adObjectId = req.params.adObjectId;
    const snap = await nscService.resolverPorAdId(adObjectId);
    if (!snap || !nscPermissao.colaboradorNoEscopo(snap, acesso)) {
      return res.status(404).json({ mensagem: 'Colaborador não encontrado no seu escopo.' });
    }
    const envio = await nscService.obterEnvioParaServir(adObjectId, req.query.envioId);
    await nscPermissao.registrarLog(req.user, req.query.download === '1' ? 'baixou' : 'visualizou', {
      alvoAdObjectId: adObjectId,
      alvoNome: snap.nome,
      detalhe: envio?.nome_arquivo || null,
    });
    if (req.query.miniatura === '1') {
      return streamMiniatura(res, envio);
    }
    const filePath = nscService.caminhoAbsoluto(envio);
    return streamEnvio(res, envio, filePath, req.query.download === '1');
  } catch (err) {
    return handleError(res, err);
  }
}

async function exportarEquipeXlsx(req, res) {
  try {
    const acesso = await acessoEquipe(req, 'exportar');
    const { buffer, filename } = await nscService.exportarEquipeXlsx(req.query, acesso);
    await nscPermissao.registrarLog(req.user, 'exportou', {
      detalhe: filename,
    });
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

async function lembrarEquipe(req, res) {
  try {
    const acesso = await acessoEquipe(req, 'lembrar');
    const body = req.body || {};
    const dados = await nscService.listarEquipe(
      {
        busca: body.busca,
        departamento: body.departamento,
        status: body.status,
      },
      acesso
    );
    let alvo = dados.colaboradores.filter((c) =>
      ['pendente', 'a_vencer', 'vencido'].includes(c.status)
    );
    const um = String(body.ad_object_id || '').trim();
    if (um) {
      alvo = alvo.filter((c) => String(c.ad_object_id).toLowerCase() === um.toLowerCase());
      if (!alvo.length) {
        return res.status(404).json({ mensagem: 'Colaborador fora do escopo ou sem pendência.' });
      }
    }
    const result = await nscNotificacoes.enviarLembretesManuais(alvo);
    await nscPermissao.registrarLog(req.user, 'lembrou', {
      alvoAdObjectId: um || null,
      alvoNome: alvo.length === 1 ? alvo[0].nome : null,
      detalhe: `${result.enviados} lembrete(s)`,
    });
    return res.json(result);
  } catch (err) {
    return handleError(res, err);
  }
}

async function assertEnvioNoEscopo(envioId, acesso) {
  const atual = await nscRepo.findEnvioById(Number(envioId));
  if (!atual) {
    const err = new Error('Envio não encontrado.');
    err.status = 404;
    throw err;
  }
  const snap = await nscService.resolverPorAdId(atual.ad_object_id);
  if (!snap || !nscPermissao.colaboradorNoEscopo(snap, acesso)) {
    const err = new Error('Colaborador fora do seu escopo.');
    err.status = 403;
    throw err;
  }
  return atual;
}

async function aprovarEquipe(req, res) {
  try {
    const acesso = await acessoEquipe(req, 'aprovar');
    await assertEnvioNoEscopo(req.params.envioId, acesso);
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

async function rejeitarEquipe(req, res) {
  try {
    const acesso = await acessoEquipe(req, 'aprovar');
    await assertEnvioNoEscopo(req.params.envioId, acesso);
    const envio = await nscService.rejeitarCertificado(
      req.params.envioId,
      req.body || {},
      req.user
    );
    await auditRepo.log({ ...auditMeta(req), action: 'NSC_REJEITAR_CERTIFICADO' });
    return res.json(envio);
  } catch (err) {
    return handleError(res, err);
  }
}

async function listarVisualizadores(req, res) {
  try {
    return res.json({ visualizadores: await nscService.listarVisualizadores() });
  } catch (err) {
    return handleError(res, err);
  }
}

async function criarVisualizador(req, res) {
  try {
    const body = req.body || {};
    if (Array.isArray(body.ad_object_ids)) {
      const visualizadores = await nscService.salvarVisualizadoresLote(body);
      await auditRepo.log({ ...auditMeta(req), action: 'NSC_ACESSO_VISUALIZADOR' });
      return res.status(201).json({ visualizadores });
    }
    const visualizador = await nscService.salvarVisualizador(body);
    await auditRepo.log({ ...auditMeta(req), action: 'NSC_ACESSO_VISUALIZADOR' });
    return res.status(201).json(visualizador);
  } catch (err) {
    return handleError(res, err);
  }
}

async function atualizarVisualizador(req, res) {
  try {
    const visualizador = await nscService.salvarVisualizador(req.body || {}, Number(req.params.id));
    await auditRepo.log({ ...auditMeta(req), action: 'NSC_ACESSO_VISUALIZADOR' });
    return res.json(visualizador);
  } catch (err) {
    return handleError(res, err);
  }
}

async function removerVisualizador(req, res) {
  try {
    await nscService.removerVisualizador(Number(req.params.id));
    await auditRepo.log({ ...auditMeta(req), action: 'NSC_ACESSO_VISUALIZADOR_REMOVER' });
    return res.json({ ok: true });
  } catch (err) {
    return handleError(res, err);
  }
}

async function listarAcessoLog(req, res) {
  try {
    return res.json({ logs: await nscService.listarAcessoLog(req.query) });
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
  listarEquipe,
  detalheEquipe,
  exportarEquipeXlsx,
  lembrarEquipe,
  aprovarEquipe,
  rejeitarEquipe,
  listarVisualizadores,
  criarVisualizador,
  atualizarVisualizador,
  removerVisualizador,
  listarAcessoLog,
};
