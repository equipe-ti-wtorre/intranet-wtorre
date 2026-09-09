const tabletAuth = require('../services/tablet-auth.service');
const massagemService = require('../services/massagem.service');

function meta(req) {
  return { requestId: req.requestId, ip: req.ip, deviceInfo: req.headers['user-agent'] };
}

function handleError(res, err) {
  return res.status(err.status || 500).json({ mensagem: err.message || 'Erro interno.' });
}

async function login(req, res) {
  try {
    const { username, usuario, senha } = req.body || {};
    const loginUser = username || usuario;
    if (!loginUser || !senha) {
      return res.status(400).json({ mensagem: 'Usuário e senha são obrigatórios.' });
    }
    const result = await tabletAuth.login(String(loginUser).trim(), senha, meta(req));
    return res.json(result);
  } catch (err) {
    return handleError(res, err);
  }
}

async function refresh(req, res) {
  try {
    const { refreshToken } = req.body || {};
    if (!refreshToken) {
      return res.status(400).json({ mensagem: 'refreshToken é obrigatório.' });
    }
    return res.json(await tabletAuth.refresh(refreshToken));
  } catch (err) {
    return handleError(res, err);
  }
}

async function logout(req, res) {
  try {
    const { refreshToken } = req.body || {};
    await tabletAuth.logout(refreshToken);
    return res.json({ ok: true });
  } catch (err) {
    return handleError(res, err);
  }
}

async function me(req, res) {
  try {
    return res.json(tabletAuth.toPublicUser(req.tabletUser));
  } catch (err) {
    return handleError(res, err);
  }
}

async function listEmpresas(req, res) {
  try {
    return res.json(await massagemService.listEmpresasPublic());
  } catch (err) {
    return handleError(res, err);
  }
}

async function listUsuarios(req, res) {
  try {
    return res.json(await tabletAuth.listUsuarios());
  } catch (err) {
    return handleError(res, err);
  }
}

async function createUsuario(req, res) {
  try {
    const user = await tabletAuth.createUsuario(req.body || {});
    return res.status(201).json(user);
  } catch (err) {
    return handleError(res, err);
  }
}

async function updateUsuario(req, res) {
  try {
    const user = await tabletAuth.updateUsuario(req.params.id, req.body || {});
    return res.json(user);
  } catch (err) {
    return handleError(res, err);
  }
}

async function alterarSenha(req, res) {
  try {
    const user = await tabletAuth.alterarSenha(req.params.id, req.body?.senha);
    return res.json(user);
  } catch (err) {
    return handleError(res, err);
  }
}

async function excluirUsuario(req, res) {
  try {
    return res.json(await tabletAuth.excluirUsuario(req.params.id, req.tabletUser.id));
  } catch (err) {
    return handleError(res, err);
  }
}

async function listEventos(req, res) {
  try {
    return res.json(await massagemService.listEventosAtivos(req.tabletUser));
  } catch (err) {
    return handleError(res, err);
  }
}

async function listaDia(req, res) {
  try {
    return res.json(
      await massagemService.tabletListaDia(req.params.eventoId, req.params.data, req.tabletUser)
    );
  } catch (err) {
    return handleError(res, err);
  }
}

async function presenca(req, res) {
  try {
    return res.json(
      await massagemService.tabletPresenca(req.params.chave, req.body?.status, req.tabletUser)
    );
  } catch (err) {
    return handleError(res, err);
  }
}

module.exports = {
  login,
  refresh,
  logout,
  me,
  listEmpresas,
  listUsuarios,
  createUsuario,
  updateUsuario,
  alterarSenha,
  excluirUsuario,
  listEventos,
  listaDia,
  presenca,
};
