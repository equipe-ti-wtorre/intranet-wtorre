const ramalAuth = require('../services/ramal-auth.service');
const colaboradoresRepo = require('../repositories/colaboradores.repository');

function meta(req) {
  return { requestId: req.requestId, ip: req.ip, deviceInfo: req.headers['user-agent'] };
}

function handleError(res, err) {
  return res.status(err.status || 500).json({ mensagem: err.message || 'Erro interno.' });
}

function toPublicColaborador(c) {
  const { sincronizado_em, ativo, ...rest } = c;
  return rest;
}

async function login(req, res) {
  try {
    const { username, usuario, senha } = req.body || {};
    const loginUser = username || usuario;
    if (!loginUser || !senha) {
      return res.status(400).json({ mensagem: 'Usuário e senha são obrigatórios.' });
    }
    const result = await ramalAuth.login(String(loginUser).trim(), senha, meta(req));
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
    return res.json(await ramalAuth.refresh(refreshToken));
  } catch (err) {
    return handleError(res, err);
  }
}

async function logout(req, res) {
  try {
    const { refreshToken } = req.body || {};
    await ramalAuth.logout(refreshToken);
    return res.json({ ok: true });
  } catch (err) {
    return handleError(res, err);
  }
}

async function me(req, res) {
  try {
    return res.json(ramalAuth.toPublicUser(req.ramalUser));
  } catch (err) {
    return handleError(res, err);
  }
}

async function listUsuarios(req, res) {
  try {
    return res.json(await ramalAuth.listUsuarios());
  } catch (err) {
    return handleError(res, err);
  }
}

async function createUsuario(req, res) {
  try {
    const user = await ramalAuth.createUsuario(req.body || {});
    return res.status(201).json(user);
  } catch (err) {
    return handleError(res, err);
  }
}

async function updateUsuario(req, res) {
  try {
    const user = await ramalAuth.updateUsuario(req.params.id, req.body || {});
    return res.json(user);
  } catch (err) {
    return handleError(res, err);
  }
}

async function alterarSenha(req, res) {
  try {
    const user = await ramalAuth.alterarSenha(req.params.id, req.body?.senha);
    return res.json(user);
  } catch (err) {
    return handleError(res, err);
  }
}

async function excluirUsuario(req, res) {
  try {
    return res.json(await ramalAuth.excluirUsuario(req.params.id, req.ramalUser.id));
  } catch (err) {
    return handleError(res, err);
  }
}

async function diretorio(req, res) {
  try {
    const { busca, empresa, departamento } = req.query;
    const colaboradores = await colaboradoresRepo.findAll({
      busca: busca?.trim() || undefined,
      empresa: empresa?.trim() || undefined,
      departamento: departamento?.trim() || undefined,
      ativoOnly: true,
    });
    const sincronizado_em = await colaboradoresRepo.getUltimaSincronizacao();
    return res.json({
      colaboradores: colaboradores.map(toPublicColaborador),
      sincronizado_em,
    });
  } catch (err) {
    return handleError(res, err);
  }
}

async function departamentos(req, res) {
  try {
    return res.json(await colaboradoresRepo.findDistinctDepartamentos());
  } catch (err) {
    return handleError(res, err);
  }
}

module.exports = {
  login,
  refresh,
  logout,
  me,
  listUsuarios,
  createUsuario,
  updateUsuario,
  alterarSenha,
  excluirUsuario,
  diretorio,
  departamentos,
};
