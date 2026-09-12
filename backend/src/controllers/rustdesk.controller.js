const rustdeskService = require('../services/rustdesk.service');
const fs = require('fs');

function handleError(res, err) {
  return res.status(err.status || 500).json({
    mensagem: err.message || 'Erro ao processar solicitação RustDesk.',
  });
}

async function resumo(_req, res) {
  try {
    return res.json(await rustdeskService.obterResumo());
  } catch (err) {
    console.error('[rustdesk] resumo:', err.message);
    return res.json({
      bridge: {
        alcancavel: false,
        ok: null,
        sqlite_acessivel: null,
        total_peers: null,
        metricas_disponiveis: null,
        versao: null,
        mensagem: 'Não foi possível consultar o bridge.',
      },
      stats: null,
      metricas: {
        disponivel: false,
        motivo: 'arquivo_ausente',
        mensagem: 'Métricas indisponíveis.',
        coletado_em: null,
        defasagem_segundos: null,
        containers: null,
        relay: null,
        host: null,
      },
      sync: null,
    });
  }
}

async function metricas(_req, res) {
  try {
    return res.json(await rustdeskService.obterMetricas());
  } catch (err) {
    console.error('[rustdesk] metricas:', err.message);
    return res.json({
      disponivel: false,
      motivo: 'arquivo_ausente',
      mensagem: 'Métricas indisponíveis.',
      coletado_em: null,
      defasagem_segundos: null,
      containers: null,
      relay: null,
      host: null,
    });
  }
}

async function listarDispositivos(req, res) {
  try {
    return res.json(await rustdeskService.listarDispositivos(req.query));
  } catch (err) {
    return handleError(res, err);
  }
}

async function obterDispositivo(req, res) {
  try {
    return res.json(await rustdeskService.obterDispositivo(Number(req.params.id)));
  } catch (err) {
    return handleError(res, err);
  }
}

async function criarDispositivo(req, res) {
  try {
    const item = await rustdeskService.criarDispositivo(req.body || {});
    return res.status(201).json(item);
  } catch (err) {
    return handleError(res, err);
  }
}

async function atualizarDispositivo(req, res) {
  try {
    return res.json(await rustdeskService.atualizarDispositivo(Number(req.params.id), req.body || {}));
  } catch (err) {
    return handleError(res, err);
  }
}

async function excluirDispositivo(req, res) {
  try {
    return res.json(await rustdeskService.excluirDispositivo(Number(req.params.id)));
  } catch (err) {
    return handleError(res, err);
  }
}

async function listarOrfaos(_req, res) {
  try {
    return res.json(await rustdeskService.listarOrfaos());
  } catch (err) {
    return handleError(res, err);
  }
}

async function vincularOrfao(req, res) {
  try {
    const item = await rustdeskService.vincularOrfao(req.params.rustdeskId, req.body || {});
    return res.status(201).json(item);
  } catch (err) {
    return handleError(res, err);
  }
}

async function importarCsv(req, res) {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({ mensagem: 'Envie um arquivo CSV no campo "arquivo".' });
    }
    const result = await rustdeskService.importarCsv(req.file.buffer);
    return res.json(result);
  } catch (err) {
    return handleError(res, err);
  }
}

async function sincronizar(_req, res) {
  try {
    const result = await rustdeskService.sincronizar();
    return res.json(result);
  } catch (err) {
    return handleError(res, err);
  }
}

async function listarSyncLog(req, res) {
  try {
    return res.json(await rustdeskService.listarSyncLog(req.query.limit));
  } catch (err) {
    return handleError(res, err);
  }
}

function baixarInstalador(_req, res) {
  const filePath = rustdeskService.resolverInstalador();
  if (!filePath) {
    return res.status(404).json({ mensagem: 'Instalador RustDesk não encontrado no servidor.' });
  }
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', 'attachment; filename="Rustdesk.zip"');
  const stream = fs.createReadStream(filePath);
  stream.on('error', () => {
    if (!res.headersSent) {
      res.status(500).json({ mensagem: 'Erro ao ler o instalador.' });
    }
  });
  return stream.pipe(res);
}

module.exports = {
  resumo,
  metricas,
  listarDispositivos,
  obterDispositivo,
  criarDispositivo,
  atualizarDispositivo,
  excluirDispositivo,
  listarOrfaos,
  vincularOrfao,
  importarCsv,
  sincronizar,
  listarSyncLog,
  baixarInstalador,
};
