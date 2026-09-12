const tenantsRepo = require('../repositories/tenants.repository');
const camarotesRepo = require('../repositories/camarotes.repository');
const graphService = require('./graph.service');
const { parseWorksheet } = require('./camarotes-xlsx.mapper');
const { env } = require('../config/env');

let syncEmAndamento = false;

async function sincronizarCamarotes() {
  if (syncEmAndamento) {
    const err = new Error('Sincronização já em andamento.');
    err.status = 409;
    throw err;
  }

  syncEmAndamento = true;
  const inicio = Date.now();
  const tipoUnidade = 'camarote';

  try {
    const config = await camarotesRepo.getConfig();
    const shareUrl = config?.sharepoint_url?.trim() || env.camarotesFileShareUrl?.trim();
    const sheetName = config?.sharepoint_sheet?.trim() || env.camarotesSheetCamarote || 'Camarotes';

    if (!shareUrl) {
      const err = new Error('URL do arquivo SharePoint não configurada. Configure na aba SharePoint.');
      err.status = 503;
      throw err;
    }

    const tenant = await tenantsRepo.findPrincipal();
    if (!tenant?.client_secret_ciphertext) {
      const err = new Error('Tenant principal não configurado para sincronização Graph.');
      err.status = 503;
      throw err;
    }

    const token = await graphService.getAppToken(tenant);
    const buffer = await graphService.downloadSharedDriveItemContent(
      token,
      graphService.normalizeShareUrl(shareUrl)
    );
    const { unidades, linhas_lidas } = parseWorksheet(buffer, sheetName, tipoUnidade);
    const linhas_gravadas = await camarotesRepo.replaceUnidadesByTipo(tipoUnidade, unidades);
    const duracao_ms = Date.now() - inicio;

    await camarotesRepo.insertSyncLog({
      tipo_unidade: tipoUnidade,
      linhas_lidas,
      linhas_gravadas,
      status: 'ok',
      erro: null,
      duracao_ms,
    });

    await camarotesRepo.touchUltimaSync();

    const configAtual = await camarotesRepo.getConfig();
    const resumo = {
      resultados: [
        {
          tipo_unidade: tipoUnidade,
          label: 'Camarotes',
          linhas_lidas,
          linhas_gravadas,
          duracao_ms,
          status: 'ok',
        },
      ],
      erros: [],
      duracao_ms,
      ultima_sync: configAtual?.ultima_sync || null,
    };

    console.log(`[camarotes.sync] Concluído em ${resumo.duracao_ms}ms (${linhas_gravadas} unidades)`);

    const alertasService = require('./camarotes-alertas.service');
    alertasService.enviarAposSync().catch((err) => {
      console.error('[camarotes.sync] Erro no envio pós-sync:', err.message);
    });

    return resumo;
  } catch (err) {
    const duracao_ms = Date.now() - inicio;
    await camarotesRepo.insertSyncLog({
      tipo_unidade: tipoUnidade,
      linhas_lidas: 0,
      linhas_gravadas: 0,
      status: 'erro',
      erro: err.message,
      duracao_ms,
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
  sincronizarCamarotes,
  isSyncEmAndamento,
};
