const { env } = require('../config/env');
const syncService = require('./rustdesk-sync.service');

let syncIntervalHandle = null;

function isCronLeader() {
  const instance = process.env.NODE_APP_INSTANCE;
  return instance == null || instance === '0' || instance === 0;
}

function runSyncSafe() {
  syncService.sincronizar().catch((err) => {
    if (err.status !== 409) {
      console.error('[rustdesk.cron] Erro na sync agendada:', err.message);
    }
  });
}

function refreshSyncSchedule() {
  if (!isCronLeader()) return;

  if (syncIntervalHandle) {
    clearInterval(syncIntervalHandle);
    syncIntervalHandle = null;
  }

  const minutos = Math.max(1, Number(env.rustdeskSyncIntervalMin) || 5);
  const ms = minutos * 60 * 1000;
  syncIntervalHandle = setInterval(runSyncSafe, ms);
  console.log(`[rustdesk.cron] Sync agendada a cada ${minutos} min`);
}

function agendarJobsRustdesk() {
  if (!isCronLeader()) {
    console.log('[rustdesk.cron] Instância secundária PM2 — jobs não agendados.');
    return;
  }

  refreshSyncSchedule();
  setTimeout(runSyncSafe, 8000);
}

module.exports = {
  agendarJobsRustdesk,
  isCronLeader,
};
