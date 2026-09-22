const https = require('https');
const { env } = require('../config/env');
const graphService = require('../services/assinatura-graph.service');
const scriptService = require('../services/assinatura-script.service');
const configService = require('../services/assinatura-config.service');
const { buildAssinaturaHtmlForOwa } = require('../utils/assinatura-html.util');
const { isDominioMapeado, isEmailPermitido } = require('../utils/assinatura-domains');

const BLOB_BASE = 'https://nubankparqueassets.blob.core.windows.net/email-assets';
const FONTES_PERMITIDAS = new Set(['NuSansDisplay-Medium.otf', 'NuSansDisplay-Regular.otf']);

function hostnameOf(host) {
  const raw = String(host || '').split(',')[0].trim().toLowerCase();
  if (!raw) return '';
  if (raw.startsWith('[')) {
    const end = raw.indexOf(']');
    return end > 0 ? raw.slice(1, end) : raw;
  }
  return raw.replace(/:\d+$/, '');
}

function isLoopbackHost(host) {
  const name = hostnameOf(host);
  return name === 'localhost' || name === '127.0.0.1' || name === '::1';
}

function fallbackPublicUrl() {
  if (env.publicAppUrl) return env.publicAppUrl;
  const fromCors = env.corsOrigins.find(
    (origin) => /^https:\/\//i.test(origin) && !isLoopbackHost(origin.replace(/^https?:\/\//i, ''))
  );
  return fromCors ? fromCors.replace(/\/+$/, '') : '';
}

function publicBaseUrl(req) {
  const forwardedHost = req.get('x-forwarded-host');
  const host = String(forwardedHost || req.get('host') || '')
    .split(',')[0]
    .trim();
  if (host && !isLoopbackHost(host)) {
    const forwardedProto = req.get('x-forwarded-proto');
    const proto = forwardedProto
      ? String(forwardedProto).split(',')[0].trim()
      : 'https';
    return `${proto}://${host}`;
  }
  return fallbackPublicUrl() || 'https://intranet.nubankparque.com';
}

async function me(req, res) {
  try {
    const profile = await graphService.fetchMeProfile(req.graphToken);
    return res.json(profile);
  } catch (err) {
    const status = err.status || 400;
    return res.status(status).json({ mensagem: err.message });
  }
}

async function gerarScript(req, res) {
  try {
    const { assinaturas, emailPadrao } = req.body || {};
    const launcher = scriptService.gerarLauncher(assinaturas, emailPadrao, publicBaseUrl(req));
    res.setHeader('Content-Type', 'application/x-bat; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="Instalar-Assinaturas.bat"'
    );
    return res.send(launcher);
  } catch (err) {
    return res.status(400).json({ mensagem: err.message });
  }
}

async function obterConfig(req, res) {
  const config = configService.get(req.params.token);
  if (!config) {
    return res.status(404).json({ mensagem: 'Configuração não encontrada ou expirada.' });
  }
  return res.json(configService.toResponsePayload(config));
}

async function obterScriptBase(_req, res) {
  try {
    const scriptPath = scriptService.caminhoTemplateBase();
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      'inline; filename="Instalar-Assinaturas-Base.ps1"'
    );
    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.sendFile(scriptPath);
  } catch (err) {
    return res.status(500).json({ mensagem: err.message });
  }
}

function servirFonte(req, res) {
  const { filename } = req.params;
  if (!FONTES_PERMITIDAS.has(filename)) {
    return res.status(404).json({ mensagem: 'Fonte não encontrada.' });
  }

  const url = `${BLOB_BASE}/${filename}`;
  https
    .get(url, (upstream) => {
      if (upstream.statusCode !== 200) {
        upstream.resume();
        return res.status(502).json({ mensagem: 'Fonte indisponível.' });
      }
      res.setHeader('Content-Type', 'font/otf');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return upstream.pipe(res);
    })
    .on('error', () => res.status(502).json({ mensagem: 'Erro ao obter fonte.' }));
}

function normalizarEmail(email) {
  return String(email || '').trim().toLowerCase();
}

async function paraEmail(req, res) {
  try {
    const email = normalizarEmail(req.params.email);
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ mensagem: 'E-mail inválido.' });
    }
    if (!isEmailPermitido(email) || !isDominioMapeado(email)) {
      return res.status(400).json({ mensagem: 'Domínio sem template de assinatura.' });
    }

    const profile = await graphService.fetchMeProfile(req.graphToken);
    const aliases = new Set(profile.aliases.map(normalizarEmail));
    if (!aliases.has(email)) {
      return res.status(403).json({ mensagem: 'E-mail não pertence ao perfil autenticado.' });
    }

    const html = buildAssinaturaHtmlForOwa({
      email,
      tipo: 'pessoal',
      nome: profile.nome,
      cargo: profile.cargo,
      telefone: profile.telefone,
      celular: profile.celular,
    });

    if (!html) {
      return res.status(400).json({ mensagem: 'Não foi possível gerar a assinatura.' });
    }

    return res.json({ email, html });
  } catch (err) {
    const status = err.status || 400;
    return res.status(status).json({ mensagem: err.message });
  }
}

module.exports = { me, gerarScript, obterConfig, obterScriptBase, servirFonte, paraEmail, publicBaseUrl };
