const tenantsRepo = require('../repositories/tenants.repository');
const followupRepo = require('../repositories/followup.repository');
const graphService = require('./graph.service');
const { parseWorkbookBuffer, listSheetHeaders } = require('./followup-xlsx.mapper');

let syncEmAndamento = false;

async function obterTenantEToken() {
  const tenant = await tenantsRepo.findPrincipal();
  if (!tenant?.client_secret_ciphertext) {
    const err = new Error(
      'Tenant principal não configurado. Cadastre o App Registration em Administração → Tenants Azure.'
    );
    err.status = 503;
    throw err;
  }
  const token = await graphService.getAppToken(tenant);
  return { tenant, token };
}

function validarConfigLocalizacao(config) {
  const shareUrl = String(config?.sharepoint_url || '').trim();
  if (!shareUrl) {
    const err = new Error(
      'URL do arquivo SharePoint não configurada. Cole o link de compartilhamento na aba SharePoint.'
    );
    err.status = 400;
    throw err;
  }
}

async function baixarPlanilha(token, config) {
  const shareUrl = graphService.normalizeShareUrl(config.sharepoint_url);
  try {
    const buffer = await graphService.downloadSharedDriveItemContent(token, shareUrl);
    return { buffer, shareUrl };
  } catch (err) {
    if (/404|not found|itemNotFound/i.test(err.message) || err.status === 404) {
      const e = new Error('Arquivo não encontrado pela URL de compartilhamento.');
      e.status = 404;
      throw e;
    }
    if (/403|accessDenied|forbidden/i.test(err.message) || err.status === 403) {
      const e = new Error(
        'Permissão negada ao arquivo SharePoint. Verifique o App Registration (Sites.Selected) e o link.'
      );
      e.status = 403;
      throw e;
    }
    throw err;
  }
}

async function testarConexao() {
  const config = await followupRepo.getConfig();
  const passos = [];

  try {
    validarConfigLocalizacao(config);
    passos.push({ passo: 'url', ok: true, detalhe: 'URL de compartilhamento configurada.' });

    const { token } = await obterTenantEToken();
    passos.push({ passo: 'autenticacao', ok: true, detalhe: 'Token Graph obtido (tenant principal).' });

    const { buffer } = await baixarPlanilha(token, config);
    passos.push({
      passo: 'arquivo',
      ok: true,
      detalhe: `Arquivo baixado (${buffer.length} bytes).`,
    });

    const abaRm = config.aba_rm || 'Requisição';
    const abaMatriz = config.aba_matriz || 'TblMatrizMensagens';
    const headers = listSheetHeaders(buffer, [abaRm, abaMatriz]);

    if (!headers.abas[abaRm]?.ok) {
      const erro = headers.abas[abaRm]?.erro || `Aba ${abaRm} ausente.`;
      passos.push({ passo: 'aba_rm', ok: false, detalhe: erro });
      return { ok: false, passos, erro, headers };
    }

    passos.push({
      passo: 'aba_rm',
      ok: true,
      detalhe: `Aba ${headers.abas[abaRm].sheetName}: ${headers.abas[abaRm].headers.slice(0, 8).join(', ')}…`,
    });

    if (headers.abas[abaMatriz]?.ok) {
      passos.push({
        passo: 'aba_matriz',
        ok: true,
        detalhe: `Aba ${headers.abas[abaMatriz].sheetName} encontrada.`,
      });
    } else {
      passos.push({
        passo: 'aba_matriz',
        ok: false,
        detalhe: headers.abas[abaMatriz]?.erro || `Aba ${abaMatriz} ausente (sync ainda pode importar RMs).`,
      });
    }

    return { ok: true, passos, headers };
  } catch (err) {
    passos.push({ passo: 'erro', ok: false, detalhe: err.message });
    return { ok: false, passos, erro: err.message, status: err.status || 502 };
  }
}

async function sincronizar() {
  if (syncEmAndamento) {
    const err = new Error('Sincronização já em andamento.');
    err.status = 409;
    throw err;
  }

  syncEmAndamento = true;
  const iniciadoEm = new Date();

  try {
    const config = await followupRepo.getConfig();
    validarConfigLocalizacao(config);
    const { token } = await obterTenantEToken();
    const { buffer } = await baixarPlanilha(token, config);

    const parsed = parseWorkbookBuffer(buffer, {
      abaRm: config.aba_rm || 'Requisição',
      abaMatriz: config.aba_matriz || 'TblMatrizMensagens',
    });

    const linhas = await followupRepo.replaceSolicitacoes(parsed.rm.solicitacoes);
    if (parsed.matriz.itens.length) {
      await followupRepo.upsertMatriz(parsed.matriz.itens);
    }

    await followupRepo.insertSyncLog({
      iniciado_em: iniciadoEm,
      status: 'sucesso',
      linhas_importadas: linhas,
      mensagem_erro: null,
    });
    await followupRepo.touchUltimaSync({ status: 'sucesso', linhas, erro: null });

    const duracao_ms = Date.now() - iniciadoEm.getTime();
    console.log(`[followup.sync] Concluído em ${duracao_ms}ms (${linhas} solicitações)`);

    return {
      status: 'sucesso',
      linhas_importadas: linhas,
      linhas_lidas: parsed.rm.linhas_lidas,
      matriz_itens: parsed.matriz.itens.length,
      duracao_ms,
      ultima_sync: (await followupRepo.getConfig()).ultima_sync,
    };
  } catch (err) {
    await followupRepo.insertSyncLog({
      iniciado_em: iniciadoEm,
      status: 'erro',
      linhas_importadas: 0,
      mensagem_erro: err.message,
    });
    await followupRepo.touchUltimaSync({
      status: 'erro',
      linhas: 0,
      erro: err.message,
    });
    throw err;
  } finally {
    syncEmAndamento = false;
  }
}

function isSyncEmAndamento() {
  return syncEmAndamento;
}

module.exports = {
  sincronizar,
  testarConexao,
  isSyncEmAndamento,
  validarConfigLocalizacao,
};
