const { sincronizarComunicadosJanela } = require('./pesquisas.service');

const INTERVAL_MS = 30_000;

let intervalHandle = null;

function isCronLeader() {
  const instance = process.env.NODE_APP_INSTANCE;
  return instance == null || instance === '0' || instance === 0;
}

function runSyncSafe() {
  sincronizarComunicadosJanela().catch((err) => {
    console.error('[pesquisas.cron] Falha ao sincronizar comunicados da janela:', err.message);
  });
}

function agendarJobsPesquisas() {
  if (!isCronLeader()) {
    console.log('[pesquisas.cron] Instância secundária PM2 — jobs não agendados.');
    return;
  }
  if (intervalHandle) return;
  runSyncSafe();
  intervalHandle = setInterval(runSyncSafe, INTERVAL_MS);
  console.log('[pesquisas.cron] Janela de comunicados a cada 30s');
}

module.exports = {
  agendarJobsPesquisas,
  sincronizarComunicadosJanela,
};
