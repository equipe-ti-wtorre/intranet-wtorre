const bcrypt = require('bcrypt');
const usuariosRepo = require('../repositories/tablet-usuarios.repository');
const refreshRepo = require('../repositories/tablet-refresh-tokens.repository');
const massagemRepo = require('../repositories/massagem.repository');
const jwtService = require('./jwt.service');

const MIN_SENHA = 4;
const PERFIS = new Set(['ADMIN', 'USER']);

function toPublicUser(user) {
  return {
    id: user.id,
    username: user.username,
    nome: user.nome,
    perfil: user.perfil === 'ADMIN' ? 'ADMIN' : 'USER',
    empresaId: user.empresaId != null ? Number(user.empresaId) : null,
    empresaNm: user.empresaNm || null,
    ativo: !!user.ativo,
  };
}

function refreshExpiresAt() {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d;
}

function tabletPayload(user) {
  return {
    sub: user.id,
    username: user.username,
    perfil: user.perfil === 'ADMIN' ? 'ADMIN' : 'USER',
    typ: 'tablet',
  };
}

function normalizePerfil(perfil) {
  const p = String(perfil || 'USER').trim().toUpperCase();
  return PERFIS.has(p) ? p : null;
}

function validateUsername(userNorm) {
  if (!/^[a-z0-9._-]{3,80}$/.test(userNorm)) {
    const err = new Error(
      'Usuário inválido. Use 3–80 caracteres: letras, números, ponto, hífen ou underscore.'
    );
    err.status = 400;
    throw err;
  }
}

async function resolveEmpresaId(empresaId, perfilNorm, allowCurrentId = null) {
  if (empresaId == null || empresaId === '') {
    if (perfilNorm === 'USER') {
      const err = new Error('Selecione a empresa da conta.');
      err.status = 400;
      throw err;
    }
    return null;
  }
  const id = Number(empresaId);
  if (!Number.isFinite(id) || id <= 0) {
    const err = new Error('Empresa inválida.');
    err.status = 400;
    throw err;
  }
  const empresa = await massagemRepo.getEmpresa(id);
  if (!empresa) {
    const err = new Error('Empresa não encontrada.');
    err.status = 400;
    throw err;
  }
  if (!empresa.ativo && Number(allowCurrentId) !== id) {
    const err = new Error('Empresa inativa.');
    err.status = 400;
    throw err;
  }
  return id;
}

async function issueTokens(user, meta = {}) {
  const payload = tabletPayload(user);
  const accessToken = jwtService.signAccess(payload);
  const refreshToken = jwtService.signRefresh(payload);
  await refreshRepo.create(user.id, refreshToken, refreshExpiresAt(), meta.deviceInfo || null);
  const usuario = toPublicUser(user);
  return {
    auth: true,
    accessToken,
    refreshToken,
    token: accessToken,
    usuario,
    user: usuario,
  };
}

async function login(username, senha, meta = {}) {
  const row = await usuariosRepo.findByUsernameWithHash(String(username || '').trim());
  if (!row || !row.ativo) {
    const err = new Error('Credenciais inválidas.');
    err.status = 401;
    throw err;
  }
  const ok = row.senha_hash && (await bcrypt.compare(senha, row.senha_hash));
  if (!ok) {
    const err = new Error('Credenciais inválidas.');
    err.status = 401;
    throw err;
  }
  return issueTokens(usuariosRepo.mapUser(row), meta);
}

async function refresh(refreshToken) {
  let payload;
  try {
    payload = jwtService.verifyRefresh(refreshToken);
  } catch {
    const err = new Error('Refresh token inválido.');
    err.status = 401;
    throw err;
  }
  if (payload.typ !== 'tablet') {
    const err = new Error('Refresh token inválido.');
    err.status = 401;
    throw err;
  }

  const stored = await refreshRepo.findValid(refreshToken);
  if (!stored) {
    const err = new Error('Refresh token inválido ou revogado.');
    err.status = 401;
    throw err;
  }

  const user = await usuariosRepo.findById(payload.sub);
  if (!user || !user.ativo) {
    await refreshRepo.revoke(refreshToken);
    const err = new Error('Usuário inválido ou inativo.');
    err.status = 401;
    throw err;
  }

  await refreshRepo.revoke(refreshToken);
  return issueTokens(user);
}

async function logout(refreshToken) {
  if (refreshToken) {
    await refreshRepo.revoke(refreshToken);
  }
}

async function listUsuarios() {
  return usuariosRepo.listAll();
}

async function createUsuario({ username, nome, senha, perfil, empresaId }) {
  const userNorm = String(username || '').trim().toLowerCase();
  const nomeNorm = String(nome || '').trim();
  const senhaStr = String(senha || '');
  const perfilNorm = normalizePerfil(perfil ?? 'USER');

  if (!userNorm || !nomeNorm || !senhaStr) {
    const err = new Error('Usuário, nome e senha são obrigatórios.');
    err.status = 400;
    throw err;
  }
  if (!perfilNorm) {
    const err = new Error('Perfil inválido. Use ADMIN ou USER.');
    err.status = 400;
    throw err;
  }
  if (senhaStr.length < MIN_SENHA) {
    const err = new Error(`A senha deve ter pelo menos ${MIN_SENHA} caracteres.`);
    err.status = 400;
    throw err;
  }
  validateUsername(userNorm);
  const empresaIdNorm = await resolveEmpresaId(empresaId, perfilNorm);

  const senhaHash = await bcrypt.hash(senhaStr, 12);
  try {
    return await usuariosRepo.create({
      username: userNorm,
      nome: nomeNorm,
      senhaHash,
      perfil: perfilNorm,
      empresaId: empresaIdNorm,
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      const e = new Error('Já existe um usuário com este nome.');
      e.status = 409;
      throw e;
    }
    throw err;
  }
}

async function updateUsuario(id, { username, nome, perfil, empresaId, ativo }) {
  const targetId = Number(id);
  if (!Number.isFinite(targetId)) {
    const err = new Error('ID inválido.');
    err.status = 400;
    throw err;
  }

  const existing = await usuariosRepo.findById(targetId);
  if (!existing) {
    const err = new Error('Usuário não encontrado.');
    err.status = 404;
    throw err;
  }

  const userNorm = String(username ?? existing.username)
    .trim()
    .toLowerCase();
  const nomeNorm = String(nome ?? existing.nome).trim();
  const perfilNorm = normalizePerfil(perfil ?? existing.perfil);
  const ativoBool = ativo === undefined ? existing.ativo : !!ativo;
  const empresaRaw = empresaId === undefined ? existing.empresaId : empresaId;

  if (!userNorm || !nomeNorm) {
    const err = new Error('Usuário e nome são obrigatórios.');
    err.status = 400;
    throw err;
  }
  if (!perfilNorm) {
    const err = new Error('Perfil inválido. Use ADMIN ou USER.');
    err.status = 400;
    throw err;
  }
  validateUsername(userNorm);
  const empresaIdNorm = await resolveEmpresaId(empresaRaw, perfilNorm, existing.empresaId);

  const wasAdminAtivo = existing.perfil === 'ADMIN' && existing.ativo;
  const willBeAdminAtivo = perfilNorm === 'ADMIN' && ativoBool;
  if (wasAdminAtivo && !willBeAdminAtivo) {
    const outrosAdmins = await usuariosRepo.countAdminsAtivos(targetId);
    if (outrosAdmins < 1) {
      const err = new Error('Não é possível remover ou desativar o último administrador ativo.');
      err.status = 400;
      throw err;
    }
  }

  try {
    return await usuariosRepo.update(targetId, {
      username: userNorm,
      nome: nomeNorm,
      perfil: perfilNorm,
      empresaId: empresaIdNorm,
      ativo: ativoBool,
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      const e = new Error('Já existe um usuário com este nome.');
      e.status = 409;
      throw e;
    }
    throw err;
  }
}

async function alterarSenha(id, senha) {
  const senhaStr = String(senha || '');
  if (senhaStr.length < MIN_SENHA) {
    const err = new Error(`A senha deve ter pelo menos ${MIN_SENHA} caracteres.`);
    err.status = 400;
    throw err;
  }
  const user = await usuariosRepo.findById(id);
  if (!user) {
    const err = new Error('Usuário não encontrado.');
    err.status = 404;
    throw err;
  }
  const senhaHash = await bcrypt.hash(senhaStr, 12);
  await usuariosRepo.updateSenha(id, senhaHash);
  await refreshRepo.revokeAllForUser(id);
  return usuariosRepo.findById(id);
}

async function excluirUsuario(id, solicitanteId) {
  const targetId = Number(id);
  if (!Number.isFinite(targetId)) {
    const err = new Error('ID inválido.');
    err.status = 400;
    throw err;
  }
  if (targetId === Number(solicitanteId)) {
    const err = new Error('Você não pode excluir o próprio usuário.');
    err.status = 400;
    throw err;
  }
  const user = await usuariosRepo.findById(targetId);
  if (!user) {
    const err = new Error('Usuário não encontrado.');
    err.status = 404;
    throw err;
  }
  if (user.perfil === 'ADMIN' && user.ativo) {
    const outrosAdmins = await usuariosRepo.countAdminsAtivos(targetId);
    if (outrosAdmins < 1) {
      const err = new Error('Não é possível excluir o último administrador ativo.');
      err.status = 400;
      throw err;
    }
  }
  const ativos = await usuariosRepo.countAtivos();
  if (user.ativo && ativos <= 1) {
    const err = new Error('Não é possível excluir o último usuário ativo.');
    err.status = 400;
    throw err;
  }
  await usuariosRepo.remove(targetId);
  return { ok: true };
}

module.exports = {
  toPublicUser,
  login,
  refresh,
  logout,
  listUsuarios,
  createUsuario,
  updateUsuario,
  alterarSenha,
  excluirUsuario,
};
