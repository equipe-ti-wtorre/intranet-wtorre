const smtpConfigRepo = require('../repositories/smtp-config.repository');
const emailProviderConfigRepo = require('../repositories/email-provider-config.repository');
const { encrypt, decrypt } = require('./crypto.service');
const { env } = require('../config/env');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HOSTNAME_RE = /^(?=.{1,253}$)(?!-)[A-Za-z0-9-]{1,63}(?<!-)(\.[A-Za-z0-9-]{1,63}(?<!-))*$/;
const EMAIL_CONFIG_TTL_MS = 30_000;

let cachedProviderConfig = null;
let cachedProviderConfigAt = 0;

function invalidateEmailConfigCache() {
  cachedProviderConfig = null;
  cachedProviderConfigAt = 0;
}

function isEmailAddress(value) {
  return EMAIL_RE.test(String(value || '').trim());
}

function isHostname(value) {
  const host = String(value || '').trim();
  if (!host || isEmailAddress(host)) return false;
  return HOSTNAME_RE.test(host);
}

async function getPublicConfig() {
  const smtp = await smtpConfigRepo.get();
  const providerRow = await emailProviderConfigRepo.get();

  const smtpPublic = smtpConfigRepo.mapSmtpConfigPublic(smtp);
  const providerPublic = emailProviderConfigRepo.mapEmailProviderConfigPublic(providerRow);

  return {
    provider: providerPublic?.provider || env.emailProvider || 'smtp',
    host: smtpPublic?.host || '',
    port: smtpPublic?.port ?? 587,
    secure: !!smtpPublic?.secure,
    user: smtpPublic?.user || '',
    has_password: !!smtpPublic?.has_password,
    from_email: smtpPublic?.from_email || '',
    from_name: smtpPublic?.from_name || '',
    has_acs_connection_string: !!providerPublic?.has_acs_connection_string,
    acs_sender: providerPublic?.acs_sender || '',
    ocultar_para: providerPublic?.ocultar_para ?? env.emailOcultarPara ?? false,
    ativo: providerPublic?.ativo ?? false,
    atualizado_em: providerPublic?.atualizado_em || smtpPublic?.atualizado_em,
  };
}

function assertActiveConfig(config) {
  if (!config.ativo) {
    const err = new Error('Envio de e-mail está desativado.');
    err.status = 503;
    throw err;
  }

  if (config.provider === 'smtp') {
    if (!config.smtp_host || !config.smtp_user || !config.smtp_from || !config.smtp_pass) {
      const err = new Error('Configuração SMTP incompleta.');
      err.status = 503;
      throw err;
    }
    if (!isHostname(config.smtp_host)) {
      const err = new Error('Host SMTP deve ser um hostname válido, não um endereço de e-mail.');
      err.status = 503;
      throw err;
    }
  } else if (config.provider === 'acs') {
    if (!config.acs_connection_string || !config.acs_sender) {
      const err = new Error('Configuração Azure ACS incompleta.');
      err.status = 503;
      throw err;
    }
    if (!isEmailAddress(config.acs_sender)) {
      const err = new Error('Endereço remetente ACS inválido.');
      err.status = 503;
      throw err;
    }
  }
}

async function loadEmailProviderConfig() {
  const smtp = await smtpConfigRepo.get();
  const providerRow = await emailProviderConfigRepo.get();

  const provider =
    providerRow?.provider === 'acs' || env.emailProvider === 'acs' ? 'acs' : 'smtp';
  const ativo = providerRow?.ativo ?? false;
  const ocultarPara = providerRow?.ocultar_para ?? env.emailOcultarPara ?? false;

  let smtpPass = null;
  if (smtp?.password_ciphertext) {
    smtpPass = decrypt(smtp.password_ciphertext);
  }

  let acsConnectionString = null;
  if (providerRow?.acs_connection_string_ciphertext) {
    acsConnectionString = decrypt(providerRow.acs_connection_string_ciphertext);
  }

  return {
    provider,
    smtp_host: smtp?.host?.trim() || '',
    smtp_port: smtp?.port ?? 587,
    smtp_secure: !!smtp?.secure,
    smtp_user: smtp?.user?.trim() || '',
    smtp_pass: smtpPass || '',
    smtp_from: smtp?.from_email?.trim() || '',
    smtp_from_name: smtp?.from_name?.trim() || null,
    acs_connection_string: acsConnectionString || '',
    acs_sender: providerRow?.acs_sender?.trim() || '',
    email_ocultar_para: !!ocultarPara,
    ativo,
  };
}

async function getEmailProviderConfig({ requireActive = false } = {}) {
  const now = Date.now();
  let config = cachedProviderConfig;
  if (!config || now - cachedProviderConfigAt >= EMAIL_CONFIG_TTL_MS) {
    config = await loadEmailProviderConfig();
    cachedProviderConfig = config;
    cachedProviderConfigAt = Date.now();
  }

  if (requireActive) {
    assertActiveConfig(config);
  }

  return config;
}

function validateSave(body, { smtpExisting, providerExisting } = {}) {
  const provider = body.provider === 'acs' ? 'acs' : 'smtp';
  const ativo = body.ativo !== false && body.ativo !== 0 ? !!body.ativo : false;
  const ocultarPara =
    body.ocultar_para === true || body.ocultar_para === 1 || body.ocultar_para === '1';

  const port = Number(body.port ?? smtpExisting?.port ?? 587);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    const err = new Error('Porta SMTP deve estar entre 1 e 65535.');
    err.status = 400;
    throw err;
  }

  const host = String(body.host ?? smtpExisting?.host ?? '').trim();
  const user = String(body.user ?? smtpExisting?.user ?? '').trim();
  const fromEmail = String(body.from_email ?? smtpExisting?.from_email ?? '').trim();
  const fromName = String(body.from_name ?? smtpExisting?.from_name ?? '').trim() || null;
  const acsSender = String(body.acs_sender ?? providerExisting?.acs_sender ?? '').trim();

  if (fromEmail && !isEmailAddress(fromEmail)) {
    const err = new Error('E-mail remetente inválido.');
    err.status = 400;
    throw err;
  }

  if (acsSender && !isEmailAddress(acsSender)) {
    const err = new Error('Endereço remetente ACS inválido.');
    err.status = 400;
    throw err;
  }

  if (host && !isHostname(host)) {
    const err = new Error('Host SMTP deve ser um hostname válido, não um endereço de e-mail.');
    err.status = 400;
    throw err;
  }

  if (ativo) {
    if (provider === 'smtp') {
      if (!host) {
        const err = new Error('Host SMTP é obrigatório quando o envio está ativo.');
        err.status = 400;
        throw err;
      }
      if (!user) {
        const err = new Error('Usuário SMTP é obrigatório quando o envio está ativo.');
        err.status = 400;
        throw err;
      }
      if (!fromEmail) {
        const err = new Error('E-mail remetente é obrigatório quando o envio está ativo.');
        err.status = 400;
        throw err;
      }
      const hasPassword =
        Boolean(body.password?.trim()) || Boolean(smtpExisting?.password_ciphertext);
      if (!hasPassword) {
        const err = new Error('Senha SMTP é obrigatória quando o envio está ativo.');
        err.status = 400;
        throw err;
      }
    } else {
      const hasAcsConnection =
        Boolean(body.acs_connection_string?.trim()) ||
        Boolean(providerExisting?.acs_connection_string_ciphertext);
      if (!hasAcsConnection) {
        const err = new Error('Connection string ACS é obrigatória quando o envio está ativo.');
        err.status = 400;
        throw err;
      }
      if (!acsSender) {
        const err = new Error('Endereço remetente ACS é obrigatório quando o envio está ativo.');
        err.status = 400;
        throw err;
      }
    }
  }

  return {
    provider,
    ativo,
    ocultar_para: ocultarPara,
    smtp: {
      host,
      port,
      secure: body.secure === true || body.secure === 1 || body.secure === '1',
      user,
      from_email: fromEmail,
      from_name: fromName,
      ativo: provider === 'smtp' ? ativo : false,
    },
    acs_sender: acsSender,
  };
}

async function save(body) {
  const smtpExisting = await smtpConfigRepo.get();
  const providerExisting = await emailProviderConfigRepo.get();
  const validated = validateSave(body, { smtpExisting, providerExisting });

  let passwordCiphertext = smtpExisting?.password_ciphertext ?? null;
  const password = body.password?.trim();
  if (password) {
    passwordCiphertext = encrypt(password);
  }

  let acsConnectionCiphertext = providerExisting?.acs_connection_string_ciphertext ?? null;
  const acsConnectionString = body.acs_connection_string?.trim();
  if (acsConnectionString) {
    acsConnectionCiphertext = encrypt(acsConnectionString);
  }

  await smtpConfigRepo.upsert({
    ...validated.smtp,
    password_ciphertext: passwordCiphertext,
  });

  await emailProviderConfigRepo.upsert({
    provider: validated.provider,
    acs_connection_string_ciphertext: acsConnectionCiphertext,
    acs_sender: validated.acs_sender,
    ocultar_para: validated.ocultar_para,
    ativo: validated.ativo,
  });

  invalidateEmailConfigCache();

  return getPublicConfig();
}

function isConfigured(config) {
  if (!config?.ativo) return false;

  if (config.provider === 'acs') {
    return Boolean(config.acs_connection_string && config.acs_sender);
  }

  return Boolean(
    config.smtp_host &&
      config.smtp_user &&
      config.smtp_from &&
      config.smtp_pass &&
      isHostname(config.smtp_host)
  );
}

module.exports = {
  getPublicConfig,
  getEmailProviderConfig,
  save,
  isConfigured,
  isHostname,
  isEmailAddress,
  invalidateEmailConfigCache,
};
