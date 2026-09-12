const followupRepo = require('../repositories/followup.repository');
const syncService = require('../services/followup-sync.service');
const { reagendarSyncFollowup } = require('../services/followup-cron.service');
const { resolveLoginFromUser } = require('../utils/resolve-login-followup');
const { enriquecerSolicitacao } = require('../services/followup-mensagem.service');
const { familiaStatus } = require('../utils/followup-status.util');
const auditRepo = require('../repositories/auditLog.repository');

function auditMeta(req) {
  return {
    userId: req.user?.id,
    requestId: req.requestId,
    ip: req.ip,
  };
}

function handleError(res, err) {
  return res.status(err.status || 500).json({
    mensagem: err.message || 'Erro ao processar solicitação de follow-up.',
  });
}

async function enriquecerLista(rows) {
  const matriz = await followupRepo.getMatrizMap();
  return rows.map((r) => enriquecerSolicitacao(r, matriz));
}

async function minhas(req, res) {
  try {
    const login = resolveLoginFromUser(req.user);
    if (!login) {
      return res.status(400).json({ mensagem: 'Não foi possível identificar o login do usuário.' });
    }
    const rows = await followupRepo.listByUsuario(login);
    return res.json(await enriquecerLista(rows));
  } catch (err) {
    return handleError(res, err);
  }
}

async function resumo(req, res) {
  try {
    const login = resolveLoginFromUser(req.user);
    if (!login) {
      return res.status(400).json({ mensagem: 'Não foi possível identificar o login do usuário.' });
    }
    const itens = await followupRepo.resumoByUsuario(login);
    return res.json(
      itens.map((i) => ({
        ...i,
        familia: familiaStatus(i.status),
      }))
    );
  } catch (err) {
    return handleError(res, err);
  }
}

/** Qualquer usuário autenticado pode consultar por número (lista /minhas segue restrita ao dono).
 *  Query: escopo=rm | documento | todos (default).
 */
async function solicitacaoPorNumero(req, res) {
  try {
    const numero = Number(String(req.params.numero || '').trim());
    if (!Number.isFinite(numero) || numero <= 0) {
      return res.status(400).json({ mensagem: 'Número inválido.' });
    }

    const escopoRaw = String(req.query.escopo || 'todos').toLowerCase();
    const escopo = ['rm', 'documento', 'todos'].includes(escopoRaw) ? escopoRaw : 'todos';

    const rows = await followupRepo.findByNumero(Math.trunc(numero), escopo);
    if (!rows.length) {
      const msg =
        escopo === 'documento'
          ? 'Nenhum contrato/pedido encontrado com esse número.'
          : escopo === 'rm'
            ? 'Nenhuma requisição encontrada com esse número.'
            : 'Nenhuma solicitação encontrada com esse número.';
      return res.status(404).json({ mensagem: msg });
    }

    return res.json(await enriquecerLista(rows));
  } catch (err) {
    return handleError(res, err);
  }
}

async function filiais(req, res) {
  try {
    const login = resolveLoginFromUser(req.user);
    if (!login) {
      return res.status(400).json({ mensagem: 'Não foi possível identificar o login do usuário.' });
    }
    const itens = await followupRepo.listFiliaisByUsuario(login);
    return res.json(itens);
  } catch (err) {
    return handleError(res, err);
  }
}

async function obterConfig(req, res) {
  try {
    const config = await followupRepo.getConfig();
    return res.json(config);
  } catch (err) {
    return handleError(res, err);
  }
}

async function atualizarConfig(req, res) {
  try {
    const body = req.body || {};
    const syncIntervalo = body.sync_intervalo_min;
    if (syncIntervalo !== undefined) {
      const n = Number(syncIntervalo);
      if (!Number.isFinite(n) || n < 5 || n > 10080) {
        return res.status(400).json({
          mensagem: 'Intervalo de sync deve ser entre 5 e 10080 minutos.',
        });
      }
    }

    const config = await followupRepo.updateConfig({
      sharepoint_url: body.sharepoint_url,
      aba_rm: body.aba_rm,
      aba_matriz: body.aba_matriz,
      sync_automatica: body.sync_automatica,
      sync_intervalo_min: body.sync_intervalo_min,
    });

    await reagendarSyncFollowup();
    await auditRepo.log({
      ...auditMeta(req),
      action: 'FOLLOWUP_CONFIG_ATUALIZAR',
      email: req.user?.email,
    });

    return res.json(config);
  } catch (err) {
    return handleError(res, err);
  }
}

async function testarConexao(req, res) {
  try {
    const resultado = await syncService.testarConexao();
    const status = resultado.ok ? 200 : resultado.status || 400;
    return res.status(status).json(resultado);
  } catch (err) {
    return handleError(res, err);
  }
}

async function sincronizar(req, res) {
  try {
    const resumoSync = await syncService.sincronizar();
    await auditRepo.log({
      ...auditMeta(req),
      action: 'FOLLOWUP_SINCRONIZAR',
      email: req.user?.email,
    });
    return res.json(resumoSync);
  } catch (err) {
    return handleError(res, err);
  }
}

async function statusSync(req, res) {
  try {
    const config = await followupRepo.getConfig();
    const ultimo = await followupRepo.getUltimoSyncLog();
    return res.json({
      sync_em_andamento: syncService.isSyncEmAndamento(),
      ultima_sync: config.ultima_sync,
      ultima_sync_status: config.ultima_sync_status,
      ultima_sync_linhas: config.ultima_sync_linhas,
      ultima_sync_erro: config.ultima_sync_erro,
      sync_automatica: config.sync_automatica,
      sync_intervalo_min: config.sync_intervalo_min,
      ultimo_log: ultimo,
    });
  } catch (err) {
    return handleError(res, err);
  }
}

module.exports = {
  minhas,
  resumo,
  solicitacaoPorNumero,
  filiais,
  obterConfig,
  atualizarConfig,
  testarConexao,
  sincronizar,
  statusSync,
};
