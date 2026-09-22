const repo = require('../repositories/solicitacao-colaborador.repository');
const blobService = require('./blob.service');
const { sendEmail, sendMailBatched } = require('../utils/emailSender');
const { CHAVES_ANEXO } = require('../config/solicitacao-campos');
const { buildGrupoHtml, buildTextoPlano, CAMPO_COL_MAP } = require('../utils/solicitacao-email-html.util');
const { buildAssunto, validarAssunto } = require('../utils/solicitacao-email-assunto.util');
const {
  decodeBlobRef,
  validarCamposGrupo,
  validarGrupoSensivel,
} = require('../utils/solicitacao-validation.util');
const { validarEmailsAlerta } = require('../utils/camarotes-email-domains.util');
const { env } = require('../config/env');

/** Dados fictícios para pré-visualizar e enviar e-mail teste sem uma solicitação real. */
const MOCK_SOLICITACAO = {
  nome: 'Ana',
  sobrenome: 'Oliveira',
  tipo: 'novo',
  cpf: '123.456.789-00',
  rg: '12.345.678-9',
  data_nascimento: '1992-03-15',
  empresa: 'WTorre',
  cargo: 'Analista de Sistemas',
  departamento: 'Tecnologia',
  centro_custo: 'TI-001',
  supervisor: 'Carlos Mendes',
  local_trabalho: 'São Paulo',
  email_novo: 'ana.oliveira@wtorre.com.br',
  solicitante: 'Maria Souza',
  solicitante_nome: 'Maria Souza',
  solicitante_email: 'maria.souza@wtorre.com.br',
  equipamento: 'notebook',
  precisa_celular: true,
  precisa_ramal: true,
  credencial_estacionamento: true,
  data_inicio: '2026-10-01',
  foto_url: 'mock://foto.jpg',
  boas_vindas_url: 'mock://boas-vindas.pdf',
  credencial_veiculo_url: 'mock://credencial.pdf',
};

async function montarAnexos(solicitacao, campos) {
  const attachments = [];
  let totalBytes = 0;
  const maxBytes = env.solicitacaoColaboradorSmtpAnexoMaxMb * 1024 * 1024;

  for (const chave of campos) {
    if (!CHAVES_ANEXO.has(chave)) continue;
    const col = CAMPO_COL_MAP[chave] || `${chave}_url`;
    const ref = solicitacao[col];
    if (!ref) continue;

    const parsed = decodeBlobRef(ref);
    if (!parsed) continue;

    const { buffer, contentType, filename } = await blobService.baixarBuffer(
      parsed.container,
      parsed.blobName
    );
    totalBytes += buffer.length;
    if (totalBytes > maxBytes) {
      const err = new Error(
        `Anexos excedem o limite de ${env.solicitacaoColaboradorSmtpAnexoMaxMb} MB para envio de e-mail.`
      );
      err.status = 400;
      throw err;
    }

    attachments.push({
      filename: filename || `${chave}.bin`,
      content: buffer,
      contentType,
    });
  }

  return attachments;
}

async function montarConteudo(solicitacao, campos, assuntoTemplate) {
  const html = buildGrupoHtml(solicitacao, campos);
  const text = buildTextoPlano(solicitacao, campos);
  const attachments = await montarAnexos(solicitacao, campos);
  const subject = buildAssunto(assuntoTemplate, solicitacao);
  return { html, text, attachments, subject };
}

async function enviarGrupo(solicitacao, grupo) {
  const destinatarios = validarEmailsAlerta(grupo.destinatarios || []);
  if (!destinatarios.length) {
    const err = new Error(`Grupo "${grupo.nome}" não possui destinatários válidos.`);
    err.status = 400;
    throw err;
  }

  validarGrupoSensivel(grupo.campos, destinatarios);

  const { html, text, attachments, subject } = await montarConteudo(
    solicitacao,
    grupo.campos,
    grupo.assunto
  );

  const { enviados, erros } = await sendMailBatched({
    recipients: destinatarios,
    subject,
    html,
    text,
    attachments,
  });

  if (enviados === 0) {
    const msg = erros.map((e) => `${e.email}: ${e.mensagem}`).join('; ') || 'Falha no envio.';
    return {
      ok: false,
      erro: msg,
      destinatarios,
    };
  }

  if (erros.length) {
    return {
      ok: true,
      parcial: true,
      erro: erros.map((e) => `${e.email}: ${e.mensagem}`).join('; '),
      destinatarios,
    };
  }

  return { ok: true, destinatarios };
}

async function enviarIndividual(solicitacao, individual) {
  const destinatarios = validarEmailsAlerta([individual.email]);
  if (!destinatarios.length) {
    const err = new Error(
      `E-mail individual "${individual.nome || individual.email}" não possui destinatário válido.`
    );
    err.status = 400;
    throw err;
  }

  validarGrupoSensivel(individual.campos, destinatarios);

  const { html, text, attachments, subject } = await montarConteudo(
    solicitacao,
    individual.campos,
    individual.assunto
  );

  try {
    await sendEmail({
      to: destinatarios[0],
      subject,
      html,
      text,
      attachments,
    });
    return { ok: true, destinatarios };
  } catch (err) {
    return {
      ok: false,
      erro: err.message || 'Falha no envio.',
      destinatarios,
    };
  }
}

function labelIndividual(individual) {
  if (individual.nome) return `E-mail individual — ${individual.nome}`;
  return `E-mail individual — ${individual.email}`;
}

async function enviarParaGrupos(solicitacaoId) {
  const solicitacao = await repo.findSolicitacaoById(solicitacaoId);
  if (!solicitacao) {
    const err = new Error('Solicitação não encontrada.');
    err.status = 404;
    throw err;
  }

  const grupos = await repo.listGruposAtivos();
  const individuais = await repo.listEmailsIndividuaisAtivos();
  const totalDestinos = grupos.length + individuais.length;

  if (!totalDestinos) {
    return {
      grupos: [],
      individuais: [],
      status: solicitacao.status,
      aviso: 'Nenhum grupo ou e-mail individual ativo.',
    };
  }

  const resultadosGrupos = [];
  const resultadosIndividuais = [];
  let okCount = 0;

  for (const grupo of grupos) {
    let status = 'ok';
    let erro = null;

    try {
      const res = await enviarGrupo(solicitacao, grupo);
      if (!res.ok) {
        status = 'erro';
        erro = res.erro;
      } else {
        okCount += 1;
        if (res.parcial) erro = res.erro;
      }

      await repo.createEnvio({
        solicitacao_id: solicitacaoId,
        grupo_id: grupo.id,
        grupo_nome: grupo.nome,
        destinatarios: res.destinatarios || grupo.destinatarios,
        status,
        erro,
      });

      resultadosGrupos.push({ grupo_id: grupo.id, grupo_nome: grupo.nome, status, erro });
    } catch (err) {
      erro = err.message;
      await repo.createEnvio({
        solicitacao_id: solicitacaoId,
        grupo_id: grupo.id,
        grupo_nome: grupo.nome,
        destinatarios: grupo.destinatarios,
        status: 'erro',
        erro,
      });
      resultadosGrupos.push({ grupo_id: grupo.id, grupo_nome: grupo.nome, status: 'erro', erro });
    }
  }

  for (const individual of individuais) {
    let status = 'ok';
    let erro = null;
    const nomeLabel = labelIndividual(individual);

    try {
      const res = await enviarIndividual(solicitacao, individual);
      if (!res.ok) {
        status = 'erro';
        erro = res.erro;
      } else {
        okCount += 1;
      }

      await repo.createEnvio({
        solicitacao_id: solicitacaoId,
        email_individual_id: individual.id,
        grupo_nome: nomeLabel,
        destinatarios: res.destinatarios || [individual.email],
        status,
        erro,
      });

      resultadosIndividuais.push({
        email_individual_id: individual.id,
        grupo_nome: nomeLabel,
        status,
        erro,
      });
    } catch (err) {
      erro = err.message;
      await repo.createEnvio({
        solicitacao_id: solicitacaoId,
        email_individual_id: individual.id,
        grupo_nome: nomeLabel,
        destinatarios: [individual.email],
        status: 'erro',
        erro,
      });
      resultadosIndividuais.push({
        email_individual_id: individual.id,
        grupo_nome: nomeLabel,
        status: 'erro',
        erro,
      });
    }
  }

  let statusFinal = 'erro';
  if (okCount === totalDestinos) statusFinal = 'enviada';
  else if (okCount > 0) statusFinal = 'parcial';

  await repo.updateSolicitacaoStatus(solicitacaoId, statusFinal);

  return {
    grupos: resultadosGrupos,
    individuais: resultadosIndividuais,
    status: statusFinal,
  };
}

function previewTemplate(campos, assunto) {
  const camposValidos = validarCamposGrupo(campos ?? []);
  const assuntoValido = validarAssunto(assunto);
  return {
    html: buildGrupoHtml(MOCK_SOLICITACAO, camposValidos),
    subject: buildAssunto(assuntoValido, MOCK_SOLICITACAO),
  };
}

async function enviarTeste(campos, assunto, email) {
  const destinatarios = validarEmailsAlerta(email ? [String(email).trim()] : []);
  if (!destinatarios.length) {
    const err = new Error('Informe um e-mail de destino válido.');
    err.status = 400;
    throw err;
  }

  const camposValidos = validarCamposGrupo(campos ?? []);
  validarGrupoSensivel(camposValidos, destinatarios);
  const assuntoValido = validarAssunto(assunto);
  const html = buildGrupoHtml(MOCK_SOLICITACAO, camposValidos);
  const text = buildTextoPlano(MOCK_SOLICITACAO, camposValidos);
  const subjectBase = buildAssunto(assuntoValido, MOCK_SOLICITACAO);
  const subject = `[TESTE] ${subjectBase}`.slice(0, 255);

  await sendEmail({
    to: destinatarios[0],
    subject,
    html,
    text,
  });

  return { ok: true };
}

async function previewGrupo(solicitacaoId, grupoId) {
  const solicitacao = await repo.findSolicitacaoById(solicitacaoId);
  if (!solicitacao) {
    const err = new Error('Solicitação não encontrada.');
    err.status = 404;
    throw err;
  }
  const grupo = await repo.findGrupoById(grupoId);
  if (!grupo) {
    const err = new Error('Grupo não encontrado.');
    err.status = 404;
    throw err;
  }
  return {
    html: buildGrupoHtml(solicitacao, grupo.campos),
    subject: buildAssunto(grupo.assunto, solicitacao),
  };
}

async function previewIndividual(solicitacaoId, emailId) {
  const solicitacao = await repo.findSolicitacaoById(solicitacaoId);
  if (!solicitacao) {
    const err = new Error('Solicitação não encontrada.');
    err.status = 404;
    throw err;
  }
  const individual = await repo.findEmailIndividualById(emailId);
  if (!individual) {
    const err = new Error('E-mail individual não encontrado.');
    err.status = 404;
    throw err;
  }
  return {
    html: buildGrupoHtml(solicitacao, individual.campos),
    subject: buildAssunto(individual.assunto, solicitacao),
  };
}

async function reenviarGrupo(solicitacaoId, grupoId) {
  const solicitacao = await repo.findSolicitacaoById(solicitacaoId);
  if (!solicitacao) {
    const err = new Error('Solicitação não encontrada.');
    err.status = 404;
    throw err;
  }
  const grupo = await repo.findGrupoById(grupoId);
  if (!grupo) {
    const err = new Error('Grupo não encontrado.');
    err.status = 404;
    throw err;
  }

  let status = 'ok';
  let erro = null;
  let destinatarios = grupo.destinatarios;

  try {
    const res = await enviarGrupo(solicitacao, grupo);
    destinatarios = res.destinatarios || destinatarios;
    if (!res.ok) {
      status = 'erro';
      erro = res.erro;
    } else if (res.parcial) {
      erro = res.erro;
    }
  } catch (err) {
    status = 'erro';
    erro = err.message;
  }

  const envio = await repo.createEnvio({
    solicitacao_id: solicitacaoId,
    grupo_id: grupo.id,
    grupo_nome: grupo.nome,
    destinatarios,
    status,
    erro,
  });

  return { envio, status, erro };
}

async function reenviarIndividual(solicitacaoId, emailId) {
  const solicitacao = await repo.findSolicitacaoById(solicitacaoId);
  if (!solicitacao) {
    const err = new Error('Solicitação não encontrada.');
    err.status = 404;
    throw err;
  }
  const individual = await repo.findEmailIndividualById(emailId);
  if (!individual) {
    const err = new Error('E-mail individual não encontrado.');
    err.status = 404;
    throw err;
  }

  let status = 'ok';
  let erro = null;
  let destinatarios = [individual.email];
  const nomeLabel = labelIndividual(individual);

  try {
    const res = await enviarIndividual(solicitacao, individual);
    destinatarios = res.destinatarios || destinatarios;
    if (!res.ok) {
      status = 'erro';
      erro = res.erro;
    }
  } catch (err) {
    status = 'erro';
    erro = err.message;
  }

  const envio = await repo.createEnvio({
    solicitacao_id: solicitacaoId,
    email_individual_id: individual.id,
    grupo_nome: nomeLabel,
    destinatarios,
    status,
    erro,
  });

  return { envio, status, erro };
}

async function encaminhar(solicitacaoId, { email, grupoId, emailIndividualId }) {
  const destinatarios = validarEmailsAlerta(email ? [String(email).trim()] : []);
  if (!destinatarios.length) {
    const err = new Error('Informe um e-mail de destino válido.');
    err.status = 400;
    throw err;
  }

  const solicitacao = await repo.findSolicitacaoById(solicitacaoId);
  if (!solicitacao) {
    const err = new Error('Solicitação não encontrada.');
    err.status = 404;
    throw err;
  }

  let campos;
  let assunto;
  let grupo_id = null;
  let email_individual_id = null;
  let origemNome = '';

  if (emailIndividualId) {
    const individual = await repo.findEmailIndividualById(Number(emailIndividualId));
    if (!individual) {
      const err = new Error('E-mail individual não encontrado.');
      err.status = 404;
      throw err;
    }
    campos = individual.campos;
    assunto = individual.assunto;
    email_individual_id = individual.id;
    origemNome = individual.nome || individual.email;
  } else if (grupoId) {
    const grupo = await repo.findGrupoById(Number(grupoId));
    if (!grupo) {
      const err = new Error('Grupo não encontrado.');
      err.status = 404;
      throw err;
    }
    campos = grupo.campos;
    assunto = grupo.assunto;
    grupo_id = grupo.id;
    origemNome = grupo.nome;
  } else {
    const err = new Error('Informe o grupo ou o e-mail individual de origem.');
    err.status = 400;
    throw err;
  }

  validarGrupoSensivel(campos, destinatarios);

  let status = 'ok';
  let erro = null;

  try {
    const { html, text, attachments, subject } = await montarConteudo(
      solicitacao,
      campos,
      assunto
    );
    const subjectFwd = email_individual_id
      ? subject
      : `[Encaminhado] ${subject}`.slice(0, 255);
    await sendEmail({
      to: destinatarios[0],
      subject: subjectFwd,
      html,
      text,
      attachments,
    });
  } catch (err) {
    status = 'erro';
    erro = err.message || 'Falha no encaminhamento.';
  }

  const envio = await repo.createEnvio({
    solicitacao_id: solicitacaoId,
    grupo_id,
    email_individual_id,
    grupo_nome: `Encaminhado — ${origemNome}`,
    destinatarios,
    status,
    erro,
  });

  return { envio, status, erro };
}

module.exports = {
  enviarParaGrupos,
  previewTemplate,
  enviarTeste,
  previewGrupo,
  previewIndividual,
  reenviarGrupo,
  reenviarIndividual,
  encaminhar,
  buildGrupoHtml,
};
