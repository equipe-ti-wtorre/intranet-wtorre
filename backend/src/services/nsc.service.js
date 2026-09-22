const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const nscRepo = require('../repositories/nsc.repository');
const colaboradoresRepo = require('../repositories/colaboradores.repository');
const {
  snapshotColaborador,
  validadeEfetiva,
  hojeIso,
  toIsoDate,
  LINK_RENOVACAO,
  LINK_PORTAL,
  LINK_CANAL,
  parseAntecedencias,
  parseEmailsRh,
} = require('../utils/nsc-status.util');
const {
  detectMimeFromBuffer,
  mimeToExt,
  sanitizeFilename,
  resolveNscPath,
  ensureNscDir,
} = require('../config/nsc-upload');
const { lerCertificado, obterMiniatura } = require('./nsc-certificado-leitura.service');
const { env } = require('../config/env');
const {
  colaboradorHtml,
  gestorHtml,
  resumoRhHtml,
  aprovacaoRhHtml,
  textoPlano,
} = require('../utils/nsc-email-html.util');
const { sendEmail } = require('../utils/emailSender');

function httpError(status, mensagem) {
  const err = new Error(mensagem);
  err.status = status;
  return err;
}

function mapOverrideInput(value) {
  if (value === null || value === 'null' || value === 'herdar' || value === '') return null;
  if (value === true || value === 1 || value === '1' || value === 'true' || value === 'sim') {
    return 1;
  }
  if (value === false || value === 0 || value === '0' || value === 'false' || value === 'nao') {
    return 0;
  }
  throw httpError(400, 'obrigatorio_override deve ser sim, não ou herdar.');
}

async function getConfig() {
  return nscRepo.getConfig();
}

async function resolverPorAdId(adObjectId) {
  if (!adObjectId) return null;
  const join = await nscRepo.findJoinByAdId(adObjectId);
  if (!join) return null;
  const config = await nscRepo.getConfig();
  const pendente = await nscRepo.findEnvioPendente(adObjectId);
  return snapshotColaborador(join.colaborador, join.certificacao, join.regra_obrigatorio, config, {
    pendente,
  });
}

function mapHistoricoEnvio(e) {
  return {
    id: e.id,
    nome_arquivo: e.nome_arquivo,
    mime: e.mime,
    tamanho: e.tamanho,
    data_emissao: e.data_emissao,
    validade: e.validade,
    nome_lido: e.nome_lido,
    enviado_em: e.enviado_em,
    vigente: e.vigente,
    aprovacao: e.aprovacao || 'aprovado',
    motivo_rejeicao: e.motivo_rejeicao || null,
    motivo_aprovacao: e.motivo_aprovacao || null,
  };
}

async function meu(user) {
  if (!user?.microsoft_id) {
    throw httpError(400, 'Usuário sem identidade do Active Directory.');
  }
  const snap = await resolverPorAdId(user.microsoft_id);
  if (!snap) {
    throw httpError(404, 'Colaborador não encontrado no diretório AD.');
  }
  const config = await nscRepo.getConfig();
  const historico = await nscRepo.listEnvios(user.microsoft_id);
  const pendente = historico.find((e) => e.aprovacao === 'pendente') || null;
  const rejeitada =
    !pendente && historico.find((e) => e.aprovacao === 'rejeitado') || null;
  return {
    ...snap,
    permitir_validade_manual: config.permitir_validade_manual,
    link_renovacao: LINK_RENOVACAO,
    link_portal: LINK_PORTAL,
    link_canal: LINK_CANAL,
    pedido_aprovacao: pendente
      ? {
          id: pendente.id,
          nome_lido: pendente.nome_lido,
          data_emissao: pendente.data_emissao,
          enviado_em: pendente.enviado_em,
          motivo_aprovacao: pendente.motivo_aprovacao || null,
        }
      : null,
    pedido_rejeitado: rejeitada
      ? {
          id: rejeitada.id,
          nome_lido: rejeitada.nome_lido,
          motivo_rejeicao: rejeitada.motivo_rejeicao,
          enviado_em: rejeitada.enviado_em,
        }
      : null,
    historico: historico.map(mapHistoricoEnvio),
  };
}

function parseValidadeManual(body, config) {
  if (!config.permitir_validade_manual || !body?.validade_manual) return null;
  const raw = String(body.validade_manual).trim();
  if (raw && !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw httpError(400, 'Validade manual inválida. Use AAAA-MM-DD.');
  }
  return raw || null;
}

function parseDataEmissaoManual(body) {
  const raw = String(body?.data_emissao || '').trim();
  if (!raw) return null;
  const iso = toIsoDate(raw);
  if (!iso) {
    throw httpError(400, 'Data de emissão inválida. Use AAAA-MM-DD.');
  }
  if (iso > hojeIso()) {
    throw httpError(400, 'A data de emissão do certificado é futura.');
  }
  return iso;
}

async function prepararLeituraCertificado(user, file, body, opts = {}) {
  if (!user?.microsoft_id) {
    throw httpError(400, 'Usuário sem identidade do Active Directory.');
  }
  if (!file) {
    throw httpError(400, 'Arquivo do certificado é obrigatório.');
  }

  const snap = await resolverPorAdId(user.microsoft_id);
  if (!snap) {
    throw httpError(404, 'Colaborador não encontrado no diretório AD.');
  }

  const header = fs.readFileSync(file.path).subarray(0, 16);
  const realMime = detectMimeFromBuffer(header);
  if (!realMime) {
    try {
      fs.unlinkSync(file.path);
    } catch {
      /* ignore */
    }
    throw httpError(400, 'O conteúdo do arquivo não é um PDF, JPG ou PNG válido.');
  }

  const config = await nscRepo.getConfig();
  const validadeManual = parseValidadeManual(body, config);
  const leitura = await lerCertificado(file.path, realMime, snap.nome);
  if (leitura.data_pendente) {
    const dataManual = parseDataEmissaoManual(body);
    if (dataManual) {
      leitura.data_emissao = dataManual;
      leitura.data_pendente = false;
    } else if (opts.exigirData) {
      throw httpError(400, 'Informe a data de emissão que aparece no certificado.');
    }
  }
  const validade = leitura.data_emissao
    ? validadeEfetiva(leitura.data_emissao, validadeManual, config.meses_validade_padrao)
    : null;

  return { snap, config, realMime, validadeManual, leitura, validade };
}

async function validarCertificado(user, file, body) {
  const { snap, leitura, validade } = await prepararLeituraCertificado(user, file, body);
  const nomeConfere = !!leitura.nome_confere;
  if (leitura.data_pendente) {
    return {
      ok: false,
      nome_lido: leitura.nome_lido,
      colaborador_nome: snap.nome,
      data_emissao: null,
      validade: null,
      nome_confere: nomeConfere,
      requer_aprovacao: !nomeConfere,
      requer_data_manual: true,
      mensagem: 'Não foi possível ler a data de emissão. Informe a data que aparece no certificado.',
    };
  }
  return {
    ok: true,
    nome_lido: leitura.nome_lido,
    colaborador_nome: snap.nome,
    data_emissao: leitura.data_emissao,
    validade,
    nome_confere: nomeConfere,
    requer_aprovacao: !nomeConfere,
  };
}

async function notificarRhAprovacao(config, snap, leitura) {
  const emails = config.emails_rh || [];
  if (!emails.length) return;
  const html = aprovacaoRhHtml({
    colaboradorNome: snap.nome,
    nomeLido: leitura.nome_lido,
    dataEmissao: formatDataPt(leitura.data_emissao),
    motivo: leitura.motivo_aprovacao,
  });
  for (const to of emails) {
    try {
      await sendEmail({
        to,
        subject: `Não se Cale — certificado de ${snap.nome} aguarda aprovação`,
        html,
        text: textoPlano(html),
      });
      await nscRepo.registrarNotificacao({
        adObjectId: snap.ad_object_id,
        tipo: 'aprovacao_rh',
        destinatario: to,
        status: 'enviado',
      });
    } catch (err) {
      await nscRepo.registrarNotificacao({
        adObjectId: snap.ad_object_id,
        tipo: 'aprovacao_rh',
        destinatario: to,
        status: 'erro',
      });
      console.error('[nsc] falha ao avisar RH da aprovação:', err.message);
    }
  }
}

async function enviarCertificado(user, file, body) {
  const { snap, config, realMime, validadeManual, leitura, validade } =
    await prepararLeituraCertificado(user, file, body, { exigirData: true });

  ensureNscDir();
  const ext = mimeToExt(realMime);
  const internalName = `${user.microsoft_id}_${Date.now()}.${ext}`;
  const dest = path.join(env.nscCertificadosDir, internalName);
  fs.renameSync(file.path, dest);

  const payload = {
    nome_arquivo: sanitizeFilename(file.originalname),
    caminho_storage: internalName,
    mime: realMime,
    tamanho: file.size,
    data_emissao: leitura.data_emissao,
    validade,
    nome_lido: leitura.nome_lido,
    motivo_aprovacao: String(body?.motivo || '').trim().slice(0, 500) || null,
  };

  if (leitura.nome_confere) {
    const envio = await nscRepo.criarEnvioVigente(user.microsoft_id, payload);
    await nscRepo.upsertCertificacao(user.microsoft_id, {
      sam_account_name: user.username || null,
      arquivo_id: envio.id,
      data_emissao: leitura.data_emissao,
      validade_manual: validadeManual,
    });
  } else {
    if (!payload.motivo_aprovacao) {
      throw httpError(400, 'Informe o motivo para o RH aprovar o certificado.');
    }
    await nscRepo.criarEnvioPendente(user.microsoft_id, payload);
    await notificarRhAprovacao(config, snap, { ...leitura, motivo_aprovacao: payload.motivo_aprovacao });
  }

  void obterMiniatura(dest, realMime).catch((err) => {
    console.warn('[nsc] falha ao gerar miniatura no envio:', err.message);
  });

  return meu(user);
}

function apagarArquivosEnvio(envio) {
  if (!envio?.caminho_storage) return;
  try {
    const filePath = resolveNscPath(envio.caminho_storage);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    const thumbPath = `${filePath.replace(/\.[^.]+$/, '')}.thumb.jpg`;
    if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);
  } catch (err) {
    console.warn('[nsc] falha ao apagar arquivo do certificado:', err.message);
  }
}

async function resolverEnvioParaRemover(adObjectId, envioId) {
  if (envioId) {
    const envio = await nscRepo.findEnvioById(Number(envioId));
    if (!envio || envio.ad_object_id !== adObjectId) {
      throw httpError(404, 'Certificado não encontrado.');
    }
    return envio;
  }
  const vigente = await nscRepo.findEnvioVigente(adObjectId);
  if (vigente) return vigente;
  const pendente = await nscRepo.findEnvioPendente(adObjectId);
  if (pendente) return pendente;
  throw httpError(404, 'Não há certificado para remover.');
}

async function removerEnvio(adObjectId, envioId) {
  const envio = await resolverEnvioParaRemover(adObjectId, envioId);
  const cert = await nscRepo.findCertificacaoByAdId(adObjectId);
  const eraAtual = !!(envio.vigente || (cert && Number(cert.arquivo_id) === Number(envio.id)));

  const removido = await nscRepo.excluirEnvio(envio.id);
  if (!removido) throw httpError(404, 'Certificado não encontrado.');

  if (eraAtual) {
    await nscRepo.upsertCertificacao(adObjectId, {
      arquivo_id: null,
      data_emissao: null,
      validade_manual: null,
    });
  }

  apagarArquivosEnvio(removido);
  return removido;
}

async function removerMeuCertificado(user, envioId) {
  if (!user?.microsoft_id) {
    throw httpError(400, 'Usuário sem identidade do Active Directory.');
  }
  await removerEnvio(user.microsoft_id, envioId);
  return meu(user);
}

async function removerCertificadoAdmin(adObjectId, envioId) {
  const snap = await resolverPorAdId(adObjectId);
  if (!snap) throw httpError(404, 'Colaborador não encontrado no diretório AD.');
  await removerEnvio(adObjectId, envioId);
  return detalheCertificado(adObjectId);
}

function aplicarFiltros(lista, { status, somenteObrigatorios, sinalizarOperacao }) {
  let out = lista;
  if (somenteObrigatorios) {
    out = out.filter((c) => c.obrigatorio_efetivo);
  }
  if (status) {
    out = out.filter((c) => c.status === status);
  }
  if (!sinalizarOperacao) {
    return out.map((c) => ({ ...c, irregular: false }));
  }
  return out;
}

async function listarColaboradores(query) {
  const config = await nscRepo.getConfig();
  const rows = await nscRepo.listJoinColaboradores({
    busca: query.busca?.trim() || undefined,
    departamento: query.departamento?.trim() || undefined,
  });
  const mappedBase = rows.filter((r) => r.colaborador.ad_id);
  const pendentes = await nscRepo.mapEnviosPendentes(mappedBase.map((r) => r.colaborador.ad_id));
  const mapped = mappedBase.map((r) =>
    snapshotColaborador(r.colaborador, r.certificacao, r.regra_obrigatorio, config, {
      pendente: pendentes.get(r.colaborador.ad_id) || null,
    })
  );

  const somenteObrigatorios =
    query.somente_obrigatorios === '1' ||
    query.somente_obrigatorios === 'true' ||
    query.somente_obrigatorios === true;

  return aplicarFiltros(mapped, {
    status: query.status?.trim() || undefined,
    somenteObrigatorios,
    sinalizarOperacao: config.sinalizar_operacao,
  });
}

const STATUS_LABEL = {
  valido: 'Válido',
  a_vencer: 'A vencer',
  vencido: 'Vencido',
  pendente: 'Pendente',
  aguardando_aprovacao: 'Aguardando aprovação',
  nao_obrigatorio: 'Não obrigatório',
};

function kpisDeLista(lista) {
  return {
    obrigatorios: lista.length,
    validos: lista.filter((c) => c.status === 'valido').length,
    a_vencer: lista.filter((c) => c.status === 'a_vencer').length,
    vencidos: lista.filter((c) => c.status === 'vencido').length,
    pendentes: lista.filter((c) => c.status === 'pendente').length,
    aguardando_aprovacao: lista.filter((c) => c.status === 'aguardando_aprovacao').length,
    irregulares: lista.filter((c) => c.irregular).length,
  };
}

function nomeDepartamento(c) {
  return String(c.departamento || '').trim() || 'Sem departamento';
}

function agruparPorDepartamento(lista) {
  const map = new Map();
  for (const c of lista) {
    const nome = nomeDepartamento(c);
    if (!map.has(nome)) map.set(nome, []);
    map.get(nome).push(c);
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'))
    .map(([departamento, itens]) => ({
      departamento,
      ...kpisDeLista(itens),
    }));
}

function formatDataPt(iso) {
  if (!iso) return '';
  const raw = String(iso);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return raw;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

async function resumo(query) {
  const lista = await listarColaboradores({
    ...query,
    status: undefined,
    somente_obrigatorios: '1',
  });
  return {
    ...kpisDeLista(lista),
    por_departamento: agruparPorDepartamento(lista),
  };
}

async function exportarRelatorioXlsx(query) {
  const depto = String(query?.departamento || '').trim();
  const queryLista =
    depto && depto !== 'Sem departamento' ? query : { ...query, departamento: undefined };
  let lista = await listarColaboradores({
    ...queryLista,
    status: undefined,
    somente_obrigatorios: '1',
  });
  if (depto === 'Sem departamento') {
    lista = lista.filter((c) => !String(c.departamento || '').trim());
  }
  const dados = {
    ...kpisDeLista(lista),
    por_departamento: agruparPorDepartamento(lista),
  };

  const resumoRows = [
    ['Indicador', 'Total'],
    ['Obrigatórios', dados.obrigatorios],
    ['Válidos', dados.validos],
    ['A vencer', dados.a_vencer],
    ['Vencidos', dados.vencidos],
    ['Pendentes', dados.pendentes],
    ['Irregulares', dados.irregulares],
    [],
    ['Departamento', 'Obrigatórios', 'Válidos', 'A vencer', 'Vencidos', 'Pendentes', 'Irregulares'],
    ...dados.por_departamento.map((d) => [
      d.departamento,
      d.obrigatorios,
      d.validos,
      d.a_vencer,
      d.vencidos,
      d.pendentes,
      d.irregulares,
    ]),
  ];

  const colabRows = [
    ['Nome', 'Cargo', 'Departamento', 'E-mail', 'Status', 'Validade', 'Dias restantes', 'Irregular'],
    ...lista.map((c) => [
      c.nome,
      c.cargo || '',
      nomeDepartamento(c),
      c.email || '',
      STATUS_LABEL[c.status] || c.status,
      formatDataPt(c.validade_efetiva),
      c.dias_restantes == null ? '' : c.dias_restantes,
      c.irregular ? 'Sim' : 'Não',
    ]),
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumoRows), 'Resumo');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(colabRows), 'Colaboradores');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const stamp = new Date().toISOString().slice(0, 10);
  const slug = depto
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 30);
  return {
    buffer,
    filename: `nsc-relatorio${slug ? `-${slug}` : ''}-${stamp}.xlsx`,
  };
}

async function patchColaborador(adObjectId, body, user) {
  if (!adObjectId) throw httpError(400, 'Identificador AD obrigatório.');
  const colab = await colaboradoresRepo.findAdminByAdId(adObjectId);
  if (!colab) throw httpError(404, 'Colaborador não encontrado no diretório AD.');

  const override = mapOverrideInput(body.obrigatorio_override);
  await nscRepo.upsertCertificacao(adObjectId, {
    sam_account_name: user?.username || null,
    obrigatorio_override: override,
  });
  return resolverPorAdId(adObjectId);
}

async function patchColaboradoresLote(body, user) {
  const bruto = Array.isArray(body?.ad_object_ids) ? body.ad_object_ids : null;
  if (!bruto) {
    throw httpError(400, 'Envie ad_object_ids (lista) e obrigatorio_override.');
  }
  const ids = [
    ...new Set(bruto.map((id) => String(id || '').trim()).filter(Boolean)),
  ];
  if (!ids.length) {
    throw httpError(400, 'Informe ao menos um colaborador.');
  }
  if (ids.length > 2000) {
    throw httpError(400, 'Limite de 2000 colaboradores por lote.');
  }
  const override = mapOverrideInput(body.obrigatorio_override);
  let atualizados = 0;
  let ignorados = 0;
  for (const adObjectId of ids) {
    const colab = await colaboradoresRepo.findAdminByAdId(adObjectId);
    if (!colab) {
      ignorados += 1;
      continue;
    }
    await nscRepo.upsertCertificacao(adObjectId, {
      sam_account_name: user?.username || null,
      obrigatorio_override: override,
    });
    atualizados += 1;
  }
  return { atualizados, ignorados };
}

async function regrasDepartamento() {
  const deptos = await colaboradoresRepo.findDistinctDepartamentos();
  const [regras, gestores] = await Promise.all([nscRepo.listRegras(), nscRepo.listGestores()]);
  const mapa = new Map(regras.map((r) => [r.departamento_ou, r]));
  const porDepto = new Map();
  for (const g of gestores) {
    const lista = porDepto.get(g.departamento_ou) || [];
    lista.push({
      ad_object_id: g.ad_object_id,
      nome: g.nome,
      email: g.email,
      cargo: g.cargo,
    });
    porDepto.set(g.departamento_ou, lista);
  }
  return deptos.map((departamento_ou) => ({
    departamento_ou,
    obrigatorio: !!mapa.get(departamento_ou)?.obrigatorio,
    gestores: porDepto.get(departamento_ou) || [],
  }));
}

async function salvarGestoresDepartamento(body) {
  const departamentoOu = String(body?.departamento_ou || '').trim();
  if (!departamentoOu) throw httpError(400, 'Informe o departamento.');
  const bruto = Array.isArray(body?.ad_object_ids) ? body.ad_object_ids : null;
  if (!bruto) throw httpError(400, 'Envie ad_object_ids (lista).');
  const ids = [...new Set(bruto.map((id) => String(id || '').trim()).filter(Boolean))];
  if (ids.length > 200) throw httpError(400, 'Limite de 200 gestores por departamento.');
  const validos = [];
  for (const adObjectId of ids) {
    const colab = await colaboradoresRepo.findAdminByAdId(adObjectId);
    if (colab) validos.push(adObjectId);
  }
  await nscRepo.substituirGestores(departamentoOu, validos);
  return regrasDepartamento();
}

async function salvarRegrasDepartamento(body) {
  const lista = Array.isArray(body) ? body : body?.regras;
  if (!Array.isArray(lista)) {
    throw httpError(400, 'Envie a lista de regras de departamento.');
  }
  const atuais = await nscRepo.listRegras();
  const mapaAtual = new Map(atuais.map((r) => [r.departamento_ou, !!r.obrigatorio]));
  for (const item of lista) {
    const nome = String(item.departamento_ou || '').trim();
    if (!nome) continue;
    const novo = !!item.obrigatorio;
    const anterior = !!mapaAtual.get(nome);
    await nscRepo.upsertRegra(nome, novo);
    if (novo && !anterior) {
      await nscRepo.limparOverrideNegativoPorDepartamento(nome);
    }
  }
  return regrasDepartamento();
}

async function salvarConfig(body) {
  const atual = await nscRepo.getConfig();
  const meses = Number(body.meses_validade_padrao ?? atual.meses_validade_padrao);
  if (!Number.isFinite(meses) || meses < 1 || meses > 120) {
    throw httpError(400, 'meses_validade_padrao deve estar entre 1 e 120.');
  }
  const antecedencias = parseAntecedencias(
    body.antecedencias_aviso ?? atual.antecedencias_aviso
  );
  const emailsRh = parseEmailsRh(body.emails_rh ?? atual.emails_rh);
  return nscRepo.saveConfig({
    meses_validade_padrao: meses,
    antecedencias_aviso: antecedencias,
    notificar_colaborador:
      body.notificar_colaborador != null
        ? !!body.notificar_colaborador
        : atual.notificar_colaborador,
    notificar_gestor:
      body.notificar_gestor != null ? !!body.notificar_gestor : atual.notificar_gestor,
    resumo_semanal_rh:
      body.resumo_semanal_rh != null ? !!body.resumo_semanal_rh : atual.resumo_semanal_rh,
    sinalizar_operacao:
      body.sinalizar_operacao != null ? !!body.sinalizar_operacao : atual.sinalizar_operacao,
    permitir_validade_manual:
      body.permitir_validade_manual != null
        ? !!body.permitir_validade_manual
        : atual.permitir_validade_manual,
    emails_rh: emailsRh,
  });
}

async function obterEnvioParaServir(adObjectId, envioId) {
  if (envioId) {
    const envio = await nscRepo.findEnvioById(Number(envioId));
    if (!envio || envio.ad_object_id !== adObjectId) {
      throw httpError(404, 'Arquivo não encontrado.');
    }
    return envio;
  }
  const vigente = await nscRepo.findEnvioVigente(adObjectId);
  if (vigente) return vigente;
  const pendente = await nscRepo.findEnvioPendente(adObjectId);
  if (pendente) return pendente;
  throw httpError(404, 'Não há certificado vigente.');
}

function caminhoAbsoluto(envio) {
  const filePath = resolveNscPath(envio.caminho_storage);
  if (!fs.existsSync(filePath)) {
    throw httpError(404, 'Arquivo não encontrado no disco.');
  }
  return filePath;
}

async function caminhoMiniatura(envio) {
  return obterMiniatura(caminhoAbsoluto(envio), envio.mime);
}

async function detalheCertificado(adObjectId) {
  const snap = await resolverPorAdId(adObjectId);
  if (!snap) throw httpError(404, 'Colaborador não encontrado no diretório AD.');
  const historico = await nscRepo.listEnvios(adObjectId);
  const vigente = historico.find((e) => e.vigente) || null;
  return {
    colaborador: snap,
    vigente: vigente
      ? {
          id: vigente.id,
          nome_arquivo: vigente.nome_arquivo,
          mime: vigente.mime,
          tamanho: vigente.tamanho,
          data_emissao: vigente.data_emissao,
          validade: vigente.validade,
          nome_lido: vigente.nome_lido,
          enviado_em: vigente.enviado_em,
        }
      : null,
    historico: historico.map(mapHistoricoEnvio),
  };
}

async function listarAprovacoes(query) {
  const status = String(query?.status || 'pendente').trim();
  const aprovacoes = await nscRepo.listarAprovacoes(status);
  const pendentes = await nscRepo.contarAprovacoesPendentes();
  return { aprovacoes, pendentes };
}

function atorAprovacao(user) {
  return String(user?.email || user?.username || user?.id || '').slice(0, 200);
}

async function aprovarCertificado(envioId, body, user) {
  const atual = await nscRepo.findEnvioById(Number(envioId));
  if (!atual) throw httpError(404, 'Envio não encontrado.');
  if (atual.aprovacao !== 'pendente') {
    throw httpError(400, 'Este certificado não está aguardando aprovação.');
  }
  const motivo = String(body?.motivo || atual.motivo_aprovacao || '').trim().slice(0, 500);
  if (!motivo) throw httpError(400, 'Informe o motivo da aprovação.');
  const envio = await nscRepo.aprovarEnvio(atual.id, motivo, atorAprovacao(user));
  if (!envio || envio.aprovacao !== 'aprovado') {
    throw httpError(400, 'Não foi possível aprovar o certificado.');
  }
  const join = await nscRepo.findJoinByAdId(envio.ad_object_id);
  await nscRepo.upsertCertificacao(envio.ad_object_id, {
    sam_account_name: join?.certificacao?.sam_account_name || null,
    arquivo_id: envio.id,
    data_emissao: envio.data_emissao,
    validade_manual: join?.certificacao?.validade_manual || null,
  });
  return envio;
}

async function rejeitarCertificado(envioId, body, user) {
  const atual = await nscRepo.findEnvioById(Number(envioId));
  if (!atual) throw httpError(404, 'Envio não encontrado.');
  if (atual.aprovacao !== 'pendente') {
    throw httpError(400, 'Este certificado não está aguardando aprovação.');
  }
  const motivo = String(body?.motivo || '').trim().slice(0, 500);
  if (!motivo) throw httpError(400, 'Informe o motivo da recusa.');
  const envio = await nscRepo.rejeitarEnvio(atual.id, motivo, atorAprovacao(user));
  if (!envio || envio.aprovacao !== 'rejeitado') {
    throw httpError(400, 'Não foi possível recusar o certificado.');
  }
  return envio;
}

async function listarNotificacoes(query) {
  return nscRepo.listarNotificacoes({
    tipo: String(query?.tipo || '').trim() || undefined,
    status: String(query?.status || '').trim() || undefined,
    busca: String(query?.busca || '').trim() || undefined,
  });
}

function isoMaisDias(dias) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + Number(dias || 0));
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function previewNotificacao(tipo, diasRaw) {
  const nome = 'Maria Silva';
  const gestorNome = 'Carlos Mendes';
  const tipoNorm = String(tipo || '').trim();
  const diasQuery = Number(diasRaw);

  if (tipoNorm === 'antecedencia' || /^antecedencia_\d+$/.test(tipoNorm)) {
    const dias = Number.isFinite(diasQuery)
      ? diasQuery
      : Number((tipoNorm.match(/^antecedencia_(\d+)$/) || [])[1] || 30);
    const validade = formatDataPt(isoMaisDias(dias));
    return {
      tipo: `antecedencia_${dias}`,
      assunto: `Não se Cale — certificado vence em ${dias} dia(s)`,
      html: colaboradorHtml({
        nome,
        status: 'a_vencer',
        validade,
        dias,
      }),
    };
  }

  if (tipoNorm === 'vencido') {
    const validade = formatDataPt(isoMaisDias(-12));
    return {
      tipo: 'vencido',
      assunto: 'Não se Cale — certificado vencido',
      html: colaboradorHtml({
        nome,
        status: 'vencido',
        validade,
        dias: -12,
      }),
    };
  }

  if (tipoNorm === 'gestor_a_vencer') {
    return {
      tipo: 'gestor_a_vencer',
      assunto: `Não se Cale — ${nome} com certificado a vencer`,
      html: gestorHtml({
        gestorNome,
        colaboradorNome: nome,
        status: 'a_vencer',
        validade: formatDataPt(isoMaisDias(15)),
      }),
    };
  }

  if (tipoNorm === 'gestor_vencido') {
    return {
      tipo: 'gestor_vencido',
      assunto: `Não se Cale — ${nome} com certificado vencido`,
      html: gestorHtml({
        gestorNome,
        colaboradorNome: nome,
        status: 'vencido',
        validade: formatDataPt(isoMaisDias(-8)),
      }),
    };
  }

  if (tipoNorm === 'resumo_rh') {
    return {
      tipo: 'resumo_rh',
      assunto: 'Não se Cale — resumo semanal de pendências',
      html: resumoRhHtml({
        kpis: {
          obrigatorios: 42,
          validos: 30,
          a_vencer: 6,
          vencidos: 4,
          pendentes: 2,
        },
        destaques: [
          {
            nome,
            departamento: 'Operações — Eventos',
            status: 'a_vencer',
            validade_efetiva: formatDataPt(isoMaisDias(15)),
          },
          {
            nome: 'João Costa',
            departamento: 'WTorre Entretenimento',
            status: 'vencido',
            validade_efetiva: formatDataPt(isoMaisDias(-8)),
          },
        ],
      }),
    };
  }

  throw httpError(400, 'Tipo de notificação inválido para pré-visualização.');
}

module.exports = {
  getConfig,
  resolverPorAdId,
  meu,
  enviarCertificado,
  validarCertificado,
  removerMeuCertificado,
  removerCertificadoAdmin,
  listarColaboradores,
  resumo,
  exportarRelatorioXlsx,
  listarNotificacoes,
  previewNotificacao,
  patchColaborador,
  patchColaboradoresLote,
  regrasDepartamento,
  salvarRegrasDepartamento,
  salvarGestoresDepartamento,
  salvarConfig,
  obterEnvioParaServir,
  caminhoAbsoluto,
  caminhoMiniatura,
  detalheCertificado,
  listarAprovacoes,
  aprovarCertificado,
  rejeitarCertificado,
};
