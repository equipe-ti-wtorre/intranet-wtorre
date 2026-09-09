const bcrypt = require('bcrypt');
const usersRepo = require('../repositories/users.repository');
const refreshRepo = require('../repositories/refreshTokens.repository');
const auditRepo = require('../repositories/auditLog.repository');
const tenantsRepo = require('../repositories/tenants.repository');
const colaboradoresRepo = require('../repositories/colaboradores.repository');
const jwtService = require('./jwt.service');
const graphService = require('./graph.service');
const permissoesService = require('./permissoes.service');
const setorUsuarioService = require('./setor-usuario.service');

const ERRO_SEM_DEPARTAMENTO =
  'Acesso negado: é necessário ter departamento cadastrado no Azure AD para usar a intranet. ' +
  'Peça ao TI/RH para preencher o campo Departamento no seu perfil do Microsoft 365.';

async function resolverDepartamentoLogin({ oid, email, profile, usuarioExistente }) {
  const doGraph = graphService.extractDepartment(profile);
  if (doGraph) return doGraph;

  if (usuarioExistente?.departamento?.trim()) {
    return usuarioExistente.departamento.trim();
  }

  const doColaborador = await colaboradoresRepo.findDepartamentoFallback(oid, email);
  if (doColaborador) return doColaborador;

  return null;
}

async function alinharEmailComColaborador(user) {
  if (!user?.microsoft_id) return user;

  const colab = await colaboradoresRepo.findAdminByAdId(user.microsoft_id);
  const emailCorporativo = colab?.email?.trim();
  if (!emailCorporativo) return user;

  const atual = (user.email || '').trim().toLowerCase();
  const corporativo = emailCorporativo.toLowerCase();
  if (!atual || atual === corporativo) {
    return atual === corporativo ? user : usersRepo.updateEmail(user.id, emailCorporativo);
  }

  return usersRepo.updateEmail(user.id, emailCorporativo);
}

async function toPublicUser(user) {
  const alinhado = await alinharEmailComColaborador(user);
  const modulos = await permissoesService.resolveModulos(alinhado);
  return {
    id: alinhado.id,
    username: alinhado.username,
    nome_completo: alinhado.nome_completo,
    email: alinhado.email,
    perfil: alinhado.perfil,
    is_ad_user: alinhado.is_ad_user,
    ativo: alinhado.ativo,
    modulos,
  };
}

function refreshExpiresAt() {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d;
}

async function issueTokens(user, meta = {}) {
  const payload = { sub: user.id, email: user.email, perfil: user.perfil };
  const accessToken = jwtService.signAccess(payload);
  const refreshToken = jwtService.signRefresh(payload);
  await refreshRepo.create(user.id, refreshToken, refreshExpiresAt(), meta.deviceInfo);
  const usuario = await toPublicUser(user);
  return {
    auth: true,
    accessToken,
    refreshToken,
    token: accessToken,
    usuario,
    user: usuario,
  };
}

async function loginLocal(email, senha, meta) {
  const row = await usersRepo.findByEmailWithHash(email);
  if (!row) {
    const err = new Error('Credenciais inválidas.');
    err.status = 401;
    throw err;
  }
  if (row.is_ad_user) {
    const err = new Error('Use Entrar com Microsoft.');
    err.status = 400;
    throw err;
  }
  if (!row.ativo) {
    const err = new Error('Usuário inativo.');
    err.status = 403;
    throw err;
  }
  const ok = row.senha_hash && (await bcrypt.compare(senha, row.senha_hash));
  if (!ok) {
    const err = new Error('Credenciais inválidas.');
    err.status = 401;
    throw err;
  }

  const user = usersRepo.mapUser(row);
  await auditRepo.log({
    userId: user.id,
    action: 'LOGIN_LOCAL',
    provider: 'local',
    email: user.email,
    requestId: meta.requestId,
    ip: meta.ip,
  });
  return issueTokens(user, meta);
}

async function loginMicrosoft(azureUser, meta) {
  const oid = azureUser.oid;
  const email =
    azureUser.preferred_username || azureUser.upn || azureUser.email || azureUser.unique_name;
  const nome = azureUser.name || azureUser.displayName || email;

  if (!oid || !email) {
    const err = new Error('Token Microsoft inválido: faltam oid ou email.');
    err.status = 400;
    throw err;
  }

  const tenant = await tenantsRepo.findByTid(azureUser.tid);
  let profile = { displayName: nome };
  try {
    profile = await graphService.getUserProfile(tenant, oid);
  } catch (err) {
    console.warn('[auth] Graph indisponível no login Microsoft:', err.message);
  }
  const nomeCompleto = profile.displayName || nome;

  let user = await usersRepo.findByMicrosoftId(oid);
  let byEmail = null;

  if (!user && email) {
    byEmail = await usersRepo.findByEmail(email);
  }

  const departamento = await resolverDepartamentoLogin({
    oid,
    email,
    profile,
    usuarioExistente: user || byEmail,
  });

  if (!departamento) {
    const err = new Error(ERRO_SEM_DEPARTAMENTO);
    err.status = 403;
    throw err;
  }

  if (!user && byEmail) {
    if (byEmail.microsoft_id && byEmail.microsoft_id !== oid) {
      const err = new Error(
        'Este e-mail já está vinculado a outra identidade Microsoft. Contate o administrador.'
      );
      err.status = 409;
      throw err;
    }
    if (!byEmail.microsoft_id) {
      user = await usersRepo.linkMicrosoft(byEmail.id, oid, nomeCompleto, departamento);
    } else {
      user = byEmail;
    }
  }
  if (!user) {
    user = await usersRepo.createMicrosoftUser({
      email,
      nome: nomeCompleto,
      departamento,
      microsoftId: oid,
      username: email.split('@')[0],
    });
  } else {
    user = await usersRepo.updateProfile(user.id, nomeCompleto, departamento);
  }

  if (!user.ativo) {
    const err = new Error('Usuário inativo.');
    err.status = 403;
    throw err;
  }

  await setorUsuarioService.resolverSetor(user);

  user = await alinharEmailComColaborador(user);

  await auditRepo.log({
    userId: user.id,
    action: 'LOGIN_MICROSOFT',
    provider: 'microsoft',
    email: user.email,
    requestId: meta.requestId,
    ip: meta.ip,
  });

  return issueTokens(user, meta);
}

async function refresh(refreshToken) {
  let payload;
  try {
    payload = jwtService.verifyRefresh(refreshToken);
  } catch {
    const err = new Error('Refresh token inválido ou expirado.');
    err.status = 401;
    throw err;
  }

  if (payload.typ === 'tablet') {
    const err = new Error('Refresh token inválido para a intranet.');
    err.status = 401;
    throw err;
  }

  const stored = await refreshRepo.findValid(refreshToken);
  if (!stored) {
    const err = new Error('Refresh token revogado ou expirado.');
    err.status = 401;
    throw err;
  }

  const user = await usersRepo.findById(payload.sub);
  if (!user || !user.ativo) {
    const err = new Error('Usuário inválido.');
    err.status = 401;
    throw err;
  }

  const accessToken = jwtService.signAccess({
    sub: user.id,
    email: user.email,
    perfil: user.perfil,
  });

  return {
    auth: true,
    accessToken,
    token: accessToken,
    user: await toPublicUser(user),
  };
}

async function logout(refreshToken) {
  if (refreshToken) {
    await refreshRepo.revoke(refreshToken);
  }
  return { ok: true };
}

module.exports = { loginLocal, loginMicrosoft, refresh, logout, toPublicUser, issueTokens };
