const cron = require('node-cron');
const { env } = require('../config/env');
const { TZ } = require('../utils/nsc-status.util');
const { executarJob } = require('./nsc-notificacoes.service');

let task = null;

function isCronLeader() {
  const instance = process.env.NODE_APP_INSTANCE;
  return instance == null || instance === '0' || instance === 0;
}

function runSafe() {
  executarJob()
    .then((totais) => {
      console.log(
        `[nsc.cron] Job concluído: ${totais.avaliados} obrigatório(s), ` +
          `${totais.colaboradores} e-mail(s) colaborador, ${totais.gestores} gestor, ` +
          `${totais.resumo_rh} resumo RH.`
      );
    })
    .catch((err) => {
      console.error('[nsc.cron] Erro no job de notificações:', err.message);
    });
}

function agendarJobsNsc() {
  if (!isCronLeader()) {
    console.log('[nsc.cron] Instância secundária PM2 — jobs não agendados.');
    return;
  }

  if (task) {
    task.stop();
    task = null;
  }

  const expr = env.nscCron || '0 8 * * *';
  if (!cron.validate(expr)) {
    console.error(`[nsc.cron] Expressão inválida: ${expr}`);
    return;
  }

  task = cron.schedule(expr, runSafe, { timezone: TZ });
  console.log(`[nsc.cron] Notificações diárias ${expr} (${TZ})`);
}

module.exports = { agendarJobsNsc };
