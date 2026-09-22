const fs = require('fs/promises');
const repo = require('../repositories/solicitacao-colaborador.repository');
const blobService = require('../services/blob.service');
const envioService = require('../services/solicitacao-envio.service');
const { usuarioPodeVisualizar } = require('../services/solicitacao-acesso.service');
const permissoesService = require('../services/permissoes.service');
const usersRepo = require('../repositories/users.repository');
const colaboradoresRepo = require('../repositories/colaboradores.repository');
const auditRepo = require('../repositories/auditLog.repository');
const { listarCampos } = require('../config/solicitacao-campos');
const {
  validarPayload,
  validarCamposGrupo,
  validarGrupoSensivel,
  encodeBlobRef,
} = require('../utils/solicitacao-validation.util');
const { validarAssunto } = require('../utils/solicitacao-email-assunto.util');
const { validarEmailsAlerta } = require('../utils/camarotes-email-domains.util');
const { env } = require('../config/env');

function handleError(res, err) {
  if (err.code === 'ER_DUP_ENTRY') {
    const msg = String(err.message || '');
    if (msg.includes('uk_email')) {
      return res.status(409).json({ mensagem: 'Já existe um e-mail individual com este endereço.' });
    }
    return res.status(409).json({ mensagem: 'Registro duplicado. Verifique o nome do grupo.' });
  }
  const bindParamError =
    typeof err.message === 'string' &&
    err.message.includes('Bind parameters must not contain undefined');
  return res.status(err.status || 500).json({
    mensagem: bindParamError
      ? 'Erro interno ao salvar a solicitação. Contate o suporte.'
      : err.message || 'Erro ao processar solicitação de colaborador.',
  });
}

async function unlinkSafe(filePath) {
  if (!filePath) return;
  try {
    await fs.unlink(filePath);
  } catch {
    /* ignore */
  }
}

async function uploadArquivo(file, container) {
  if (!file) return null;
  const blobName = blobService.novoBlobName(file.originalname);
  await blobService.enviarArquivo(container, file.path, blobName, file.mimetype);
  return { container, blobName, ref: encodeBlobRef(container, blobName) };
}

async function rollbackUploads(uploads) {
  for (const u of uploads) {
    if (u?.container && u?.blobName) {
      await blobService.removerBlob(u.container, u.blobName);
    }
  }
}

async function acesso(req, res) {
  try {
    const pode_visualizar = await usuarioPodeVisualizar(req.user, req.userModulos || []);
    return res.json({ pode_visualizar });
  } catch (err) {
    return handleError(res, err);
  }
}

async function campos(_req, res) {
  try {
    return res.json(listarCampos());
  } catch (err) {
    return handleError(res, err);
  }
}

async function criar(req, res) {
  const fotoFile = req.files?.foto?.[0];
  const boasVindasFile = req.files?.boas_vindas?.[0];
  const credencialVeiculoFile = req.files?.credencial_veiculo?.[0];
  const uploads = [];

  try {
    const payload = validarPayload(req.body, {
      foto: fotoFile,
      boas_vindas: boasVindasFile,
      credencial_veiculo: credencialVeiculoFile,
    });

    const container = env.solicitacaoColaboradorContainer;
    await blobService.garantirContainer(container);

    let foto_url = null;
    let boas_vindas_url = null;
    let credencial_veiculo_url = null;

    if (fotoFile) {
      const up = await uploadArquivo(fotoFile, container);
      uploads.push(up);
      foto_url = up.ref;
    }
    if (boasVindasFile) {
      const up = await uploadArquivo(boasVindasFile, container);
      uploads.push(up);
      boas_vindas_url = up.ref;
    }
    if (credencialVeiculoFile) {
      const up = await uploadArquivo(credencialVeiculoFile, container);
      uploads.push(up);
      credencial_veiculo_url = up.ref;
    }

    const solicitacao = await repo.createSolicitacao({
      ...payload,
      solicitante_nome: payload.solicitante ?? null,
      solicitante_usuario_id: req.user.id,
      foto_url,
      boas_vindas_url,
      credencial_veiculo_url,
      status: 'recebida',
      criado_por: req.user.id,
    });

    const envio = await envioService.enviarParaGrupos(solicitacao.id);

    await auditRepo.log({
      userId: req.user.id,
      action: 'SOLICITACAO_COLABORADOR_CRIADA',
      email: req.user.email,
      requestId: req.requestId,
      ip: req.ip,
    });

    return res.status(201).json({
      solicitacao,
      envio,
    });
  } catch (err) {
    await rollbackUploads(uploads);
    return handleError(res, err);
  } finally {
    await unlinkSafe(fotoFile?.path);
    await unlinkSafe(boasVindasFile?.path);
    await unlinkSafe(credencialVeiculoFile?.path);
  }
}

async function minhas(req, res) {
  try {
    const lista = await repo.listSolicitacoesBySolicitante(req.user.id);
    return res.json(lista);
  } catch (err) {
    return handleError(res, err);
  }
}

async function listarSolicitacoesAdmin(req, res) {
  try {
    const lista = await repo.listSolicitacoesAdmin({
      tipo: req.query.tipo,
      status: req.query.status,
      de: req.query.de,
      ate: req.query.ate,
    });
    return res.json(lista);
  } catch (err) {
    return handleError(res, err);
  }
}

async function obterSolicitacaoAdmin(req, res) {
  try {
    const id = Number(req.params.id);
    const solicitacao = await repo.findSolicitacaoById(id);
    if (!solicitacao) {
      return res.status(404).json({ mensagem: 'Solicitação não encontrada.' });
    }
    const envios = await repo.listEnviosBySolicitacao(id);
    return res.json({ solicitacao, envios });
  } catch (err) {
    return handleError(res, err);
  }
}

async function previewTemplate(req, res) {
  try {
    const preview = envioService.previewTemplate(req.body?.campos, req.body?.assunto);
    return res.json(preview);
  } catch (err) {
    return handleError(res, err);
  }
}

async function enviarTeste(req, res) {
  try {
    const resultado = await envioService.enviarTeste(
      req.body?.campos,
      req.body?.assunto,
      req.body?.email
    );
    return res.json(resultado);
  } catch (err) {
    return handleError(res, err);
  }
}

async function previewEmail(req, res) {
  try {
    const solicitacaoId = Number(req.params.id);
    const grupoId = Number(req.params.grupoId);
    const preview = await envioService.previewGrupo(solicitacaoId, grupoId);
    return res.json(preview);
  } catch (err) {
    return handleError(res, err);
  }
}

async function reenviarEmail(req, res) {
  try {
    const solicitacaoId = Number(req.params.id);
    const grupoId = Number(req.params.grupoId);
    const resultado = await envioService.reenviarGrupo(solicitacaoId, grupoId);
    return res.json(resultado);
  } catch (err) {
    return handleError(res, err);
  }
}

async function previewEmailIndividual(req, res) {
  try {
    const solicitacaoId = Number(req.params.id);
    const emailId = Number(req.params.emailId);
    const preview = await envioService.previewIndividual(solicitacaoId, emailId);
    return res.json(preview);
  } catch (err) {
    return handleError(res, err);
  }
}

async function encaminharEmail(req, res) {
  try {
    const solicitacaoId = Number(req.params.id);
    const resultado = await envioService.encaminhar(solicitacaoId, {
      email: req.body?.email,
      grupoId: req.body?.grupoId,
      emailIndividualId: req.body?.emailIndividualId,
    });
    return res.json(resultado);
  } catch (err) {
    return handleError(res, err);
  }
}

async function reenviarEmailIndividual(req, res) {
  try {
    const solicitacaoId = Number(req.params.id);
    const emailId = Number(req.params.emailId);
    const resultado = await envioService.reenviarIndividual(solicitacaoId, emailId);
    return res.json(resultado);
  } catch (err) {
    return handleError(res, err);
  }
}

async function listarGrupos(_req, res) {
  try {
    const lista = await repo.listGruposAdmin();
    return res.json(lista);
  } catch (err) {
    return handleError(res, err);
  }
}

async function criarGrupo(req, res) {
  try {
    const nome = req.body?.nome?.trim();
    if (!nome) {
      return res.status(400).json({ mensagem: 'Nome do grupo é obrigatório.' });
    }
    const destinatarios = validarEmailsAlerta(req.body?.destinatarios ?? []);
    const campos = validarCamposGrupo(req.body?.campos ?? []);
    validarGrupoSensivel(campos, destinatarios);
    const assunto = validarAssunto(
      req.body?.assunto !== undefined ? req.body.assunto : null
    );

    const grupo = await repo.createGrupo({
      nome,
      destinatarios,
      campos,
      assunto,
      ativo: req.body?.ativo !== false,
      ordem: Number(req.body?.ordem) || 0,
    });
    return res.status(201).json(grupo);
  } catch (err) {
    return handleError(res, err);
  }
}

async function atualizarGrupo(req, res) {
  try {
    const id = Number(req.params.id);
    const existing = await repo.findGrupoById(id);
    if (!existing) {
      return res.status(404).json({ mensagem: 'Grupo não encontrado.' });
    }

    const nome = req.body?.nome?.trim() || existing.nome;
    const destinatarios = validarEmailsAlerta(
      req.body?.destinatarios !== undefined ? req.body.destinatarios : existing.destinatarios
    );
    const campos = validarCamposGrupo(
      req.body?.campos !== undefined ? req.body.campos : existing.campos
    );
    validarGrupoSensivel(campos, destinatarios);
    const assunto = validarAssunto(
      req.body?.assunto !== undefined ? req.body.assunto : existing.assunto
    );

    const grupo = await repo.updateGrupo(id, {
      nome,
      destinatarios,
      campos,
      assunto,
      ativo: req.body?.ativo !== undefined ? !!req.body.ativo : existing.ativo,
      ordem: req.body?.ordem !== undefined ? Number(req.body.ordem) : existing.ordem,
    });
    return res.json(grupo);
  } catch (err) {
    return handleError(res, err);
  }
}

async function removerGrupo(req, res) {
  try {
    const id = Number(req.params.id);
    const removido = await repo.deleteGrupo(id);
    if (!removido) {
      return res.status(404).json({ mensagem: 'Grupo não encontrado.' });
    }
    return res.json({ ok: true });
  } catch (err) {
    return handleError(res, err);
  }
}

async function listarEmailsIndividuais(_req, res) {
  try {
    const lista = await repo.listEmailsIndividuaisAdmin();
    return res.json(lista);
  } catch (err) {
    return handleError(res, err);
  }
}

async function criarEmailIndividual(req, res) {
  try {
    const emailList = validarEmailsAlerta(
      req.body?.email ? [String(req.body.email).trim().toLowerCase()] : []
    );
    if (!emailList.length) {
      return res.status(400).json({ mensagem: 'E-mail do destinatário é obrigatório.' });
    }
    const campos = validarCamposGrupo(req.body?.campos ?? []);
    validarGrupoSensivel(campos, emailList);
    const assunto = validarAssunto(
      req.body?.assunto !== undefined ? req.body.assunto : null
    );
    const nome = req.body?.nome != null ? String(req.body.nome).trim() || null : null;

    const individual = await repo.createEmailIndividual({
      nome,
      email: emailList[0],
      assunto,
      campos,
      ativo: req.body?.ativo !== false,
      ordem: Number(req.body?.ordem) || 0,
    });
    return res.status(201).json(individual);
  } catch (err) {
    return handleError(res, err);
  }
}

async function atualizarEmailIndividual(req, res) {
  try {
    const id = Number(req.params.id);
    const existing = await repo.findEmailIndividualById(id);
    if (!existing) {
      return res.status(404).json({ mensagem: 'E-mail individual não encontrado.' });
    }

    const emailRaw =
      req.body?.email !== undefined ? String(req.body.email).trim().toLowerCase() : existing.email;
    const emailList = validarEmailsAlerta([emailRaw]);
    if (!emailList.length) {
      return res.status(400).json({ mensagem: 'E-mail do destinatário é obrigatório.' });
    }
    const campos = validarCamposGrupo(
      req.body?.campos !== undefined ? req.body.campos : existing.campos
    );
    validarGrupoSensivel(campos, emailList);
    const assunto = validarAssunto(
      req.body?.assunto !== undefined ? req.body.assunto : existing.assunto
    );
    const nome =
      req.body?.nome !== undefined
        ? String(req.body.nome || '').trim() || null
        : existing.nome;

    const individual = await repo.updateEmailIndividual(id, {
      nome,
      email: emailList[0],
      assunto,
      campos,
      ativo: req.body?.ativo !== undefined ? !!req.body.ativo : existing.ativo,
      ordem: req.body?.ordem !== undefined ? Number(req.body.ordem) : existing.ordem,
    });
    return res.json(individual);
  } catch (err) {
    return handleError(res, err);
  }
}

async function removerEmailIndividual(req, res) {
  try {
    const id = Number(req.params.id);
    const removido = await repo.deleteEmailIndividual(id);
    if (!removido) {
      return res.status(404).json({ mensagem: 'E-mail individual não encontrado.' });
    }
    return res.json({ ok: true });
  } catch (err) {
    return handleError(res, err);
  }
}

async function buscarUsuariosAd(req, res) {
  try {
    const q = req.query.q?.trim();
    if (!q || q.length < 2) {
      return res.json([]);
    }

    const colaboradores = await colaboradoresRepo.findAll({ busca: q, ativoOnly: true });
    const result = colaboradores.slice(0, 20).map((c) => ({
      id: c.id,
      nome: c.nome,
      email: c.email,
      departamento: c.departamento,
      empresa: c.empresa,
    }));
    return res.json(result);
  } catch (err) {
    return handleError(res, err);
  }
}

async function listarVisualizadores(_req, res) {
  try {
    const lista = await repo.listVisualizadores();
    return res.json(lista);
  } catch (err) {
    return handleError(res, err);
  }
}

async function adicionarVisualizador(req, res) {
  try {
    let usuarioId = Number(req.body?.usuario_id);
    if (!usuarioId && req.body?.colaborador_id) {
      const user = await permissoesService.provisionarUsuarioDeColaborador(
        Number(req.body.colaborador_id)
      );
      usuarioId = user.id;
    }

    if (!usuarioId) {
      return res.status(400).json({ mensagem: 'Informe usuario_id ou colaborador_id.' });
    }

    const user = await usersRepo.findById(usuarioId);
    if (!user || !user.ativo) {
      return res.status(404).json({ mensagem: 'Usuário não encontrado ou inativo.' });
    }

    const visualizador = await repo.addVisualizador(usuarioId, req.user.id);
    return res.status(201).json(visualizador);
  } catch (err) {
    return handleError(res, err);
  }
}

async function removerVisualizador(req, res) {
  try {
    const usuarioId = Number(req.params.usuarioId);
    const removido = await repo.removeVisualizador(usuarioId);
    if (!removido) {
      return res.status(404).json({ mensagem: 'Visualizador não encontrado.' });
    }
    return res.json({ ok: true });
  } catch (err) {
    return handleError(res, err);
  }
}

module.exports = {
  acesso,
  campos,
  criar,
  minhas,
  listarSolicitacoesAdmin,
  obterSolicitacaoAdmin,
  previewTemplate,
  enviarTeste,
  previewEmail,
  reenviarEmail,
  previewEmailIndividual,
  reenviarEmailIndividual,
  encaminharEmail,
  listarGrupos,
  criarGrupo,
  atualizarGrupo,
  removerGrupo,
  listarEmailsIndividuais,
  criarEmailIndividual,
  atualizarEmailIndividual,
  removerEmailIndividual,
  buscarUsuariosAd,
  listarVisualizadores,
  adicionarVisualizador,
  removerVisualizador,
};
