const cron = require('node-cron');
const camarotesRepo = require('../repositories/camarotes.repository');
const syncService = require('./camarotes-sync.service');
const alertasService = require('./camarotes-alertas.service');
const { env } = require('../config/env');

const TZ = 'America/Sao_Paulo';

const FREQUENCIA_MS = {
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '12h': 12 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  semanal: 7 * 24 * 60 * 60 * 1000,
};

let syncIntervalHandle = null;
let alertasCronTask = null;

function isCronLeader() {
  const instance = process.env.NODE_APP_INSTANCE;
  return instance == null || instance === '0' || instance === 0;
}

function frequenciaParaMs(frequencia) {
  return FREQUENCIA_MS[frequencia] || FREQUENCIA_MS['24h'];
}

function runSyncSafe() {
  syncService.sincronizarCamarotes().catch((err) => {
    if (err.status !== 409) {
      console.error('[camarotes.cron] Erro na sync agendada:', err.message);
    }
  });
}

async function refreshSyncSchedule() {
  if (!isCronLeader()) return;

  if (syncIntervalHandle) {
    clearInterval(syncIntervalHandle);
    syncIntervalHandle = null;
  }

  const config = await camarotesRepo.getConfig();
  if (!config?.sync_automatica) {
    console.log('[camarotes.cron] Sync automática desativada.');
    return;
  }

  const shareUrl = config?.sharepoint_url?.trim() || env.camarotesFileShareUrl?.trim();
  if (!shareUrl) {
    console.log('[camarotes.cron] URL SharePoint não configurada — sync automática ignorada.');
    return;
  }

  const ms = frequenciaParaMs(config.sync_frequencia);
  syncIntervalHandle = setInterval(runSyncSafe, ms);
  console.log(`[camarotes.cron] Sync agendada a cada ${config.sync_frequencia}`);

  const ultima = config.ultima_sync ? new Date(config.ultima_sync).getTime() : 0;
  if (!ultima || Date.now() - ultima >= ms) {
    setTimeout(runSyncSafe, 5000);
  }
}

async function refreshAlertasSchedule() {
  if (!isCronLeader()) return;

  if (alertasCronTask) {
    alertasCronTask.stop();
    alertasCronTask = null;
  }

  const config = await camarotesRepo.getConfig();
  const horario = config?.horario_envio || '08:00';
  const match = String(horario).match(/^(\d{1,2}):(\d{2})$/);
  const minute = match ? Number(match[2]) : 0;
  const hour = match ? Number(match[1]) : 8;
  const expr = `${minute} ${hour} * * *`;

  alertasCronTask = cron.schedule(
    expr,
    () => {
      alertasService.tentarEnvioCron().catch((err) => {
        console.error('[camarotes.cron] Erro no envio de alertas:', err.message);
      });
    },
    { timezone: TZ }
  );

  console.log(`[camarotes.cron] Alertas diários ${horario} (${TZ})`);
}

function agendarJobsCamarotes() {
  if (!isCronLeader()) {
    console.log('[camarotes.cron] Instância secundária PM2 — jobs não agendados.');
    return;
  }

  refreshAlertasSchedule().catch((err) => {
    console.error('[camarotes.cron] Falha ao agendar alertas:', err.message);
  });

  refreshSyncSchedule().catch((err) => {
    console.error('[camarotes.cron] Falha ao agendar sync automática:', err.message);
  });
}

async function reagendarAlertasCamarotes() {
  await refreshAlertasSchedule();
}

module.exports = {
  agendarJobsCamarotes,
  reagendarSyncCamarotes: refreshSyncSchedule,
  reagendarAlertasCamarotes,
  isCronLeader,
  frequenciaParaMs,
};
