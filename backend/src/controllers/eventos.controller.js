const fs = require('fs');
const path = require('path');
const fontesRepo = require('../repositories/eventos-fontes.repository');
const eventosService = require('../services/eventos/eventos.service');
const parsers = require('../services/eventos/parsers');
const auditRepo = require('../repositories/auditLog.repository');
const { env } = require('../config/env');
const { processLogoImage } = require('../services/grupo-logos-image.service');
const { ensureEventosFontesLogosDir } = require('../config/eventos-fontes-logo-upload');
const {
  STORED_URL_PREFIX,
  cleanupOrphanFonteLogo,
} = require('../utils/eventos-fontes-logo.util');

const CODIGO_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function handleError(res, err) {
  return res.status(err.status || 500).json({
    mensagem: err.message || 'Erro ao processar eventos.',
  });
}

function audit(req, action) {
  return auditRepo.log({
    userId: req.user?.id,
    action,
    email: req.user?.email,
    requestId: req.requestId,
    ip: req.ip,
  });
}

function validarUrl(url) {
  const value = String(url || '').trim();
  if (!value || value.length > 500) {
    const err = new Error('URL inválida (máx. 500 caracteres).');
    err.status = 400;
    throw err;
  }
  if (!/^https?:\/\//i.test(value)) {
    const err = new Error('URL deve começar com http:// ou https://');
    err.status = 400;
    throw err;
  }
  return value;
}

function validarCodigo(codigo) {
  const value = String(codigo || '').trim().toLowerCase();
  if (!value || value.length > 50 || !CODIGO_RE.test(value)) {
    const err = new Error('Código inválido. Use letras minúsculas, números e hífens.');
    err.status = 400;
    throw err;
  }
  return value;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validarLimiteAgenda(limite, comFiltro = false) {
  if (limite === null || limite === undefined || limite === '') return null;
  const n = Number(limite);
  const teto = comFiltro ? 200 : 100;
  if (!Number.isFinite(n) || n < 1 || n > teto) {
    const err = new Error(`Limite deve ser entre 1 e ${teto} ou vazio.`);
    err.status = 400;
    throw err;
  }
  return Math.floor(n);
}

function validarIsoData(valor, nome) {
  const value = String(valor || '').trim();
  if (!ISO_DATE_RE.test(value)) {
    const err = new Error(`${nome} inválida. Use YYYY-MM-DD.`);
    err.status = 400;
    throw err;
  }
  return value;
}

function parseAgendaQuery(query) {
  const de = query.de != null && query.de !== '' ? validarIsoData(query.de, 'Data inicial') : null;
  const ate = query.ate != null && query.ate !== '' ? validarIsoData(query.ate, 'Data final') : null;
  const anoRaw = query.ano;
  const mesRaw = query.mes;
  const temIntervalo = Boolean(de || ate);
  const temMes = anoRaw != null && anoRaw !== '' && mesRaw != null && mesRaw !== '';

  if (temIntervalo && (!de || !ate)) {
    const err = new Error('Informe de e ate para filtrar por intervalo.');
    err.status = 400;
    throw err;
  }
  if (temIntervalo && temMes) {
    const err = new Error('Use de/ate ou ano/mes, não ambos.');
    err.status = 400;
    throw err;
  }
  if (de && ate && de > ate) {
    const err = new Error('Data inicial não pode ser posterior à final.');
    err.status = 400;
    throw err;
  }

  let ano = null;
  let mes = null;
  if (temMes) {
    ano = Number(anoRaw);
    mes = Number(mesRaw);
    if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) {
      const err = new Error('Ano inválido.');
      err.status = 400;
      throw err;
    }
    if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
      const err = new Error('Mês inválido (1–12).');
      err.status = 400;
      throw err;
    }
  }

  const comFiltro = temIntervalo || temMes;
  const limiteRaw = query.limite;
  const limite =
    limiteRaw != null && limiteRaw !== ''
      ? validarLimiteAgenda(limiteRaw, comFiltro)
      : undefined;

  return { limite, de, ate, ano, mes };
}

function validarLimite(limite) {
  if (limite === null || limite === undefined || limite === '') return null;
  const n = Number(limite);
  if (!Number.isFinite(n) || n < 1 || n > 100) {
    const err = new Error('Limite deve ser entre 1 e 100 ou vazio.');
    err.status = 400;
    throw err;
  }
  return Math.floor(n);
}

function bodyParaFonte(body, { parcial = false, codigoFixo } = {}) {
  const data = {};

  if (!parcial || body.codigo !== undefined) {
    if (codigoFixo) {
      data.codigo = codigoFixo;
    } else {
      data.codigo = validarCodigo(body.codigo);
    }
  }

  if (!parcial || body.nome !== undefined) {
    const nome = String(body.nome || '').trim();
    if (!nome) {
      const err = new Error('Nome é obrigatório.');
      err.status = 400;
      throw err;
    }
    if (nome.length > 120) {
      const err = new Error('Nome deve ter no máximo 120 caracteres.');
      err.status = 400;
      throw err;
    }
    data.nome = nome;
  }

  if (!parcial || body.url !== undefined) {
    data.url = validarUrl(body.url);
  }

  const parserTipo = body.parser_tipo ?? body.parserTipo;
  if (!parcial || parserTipo !== undefined) {
    const tipo = String(parserTipo || '').trim();
    if (!tipo || !parsers.isParserValido(tipo)) {
      const err = new Error('Tipo de parser inválido.');
      err.status = 400;
      throw err;
    }
    data.parserTipo = tipo;
  }

  if (!parcial || body.ordem !== undefined) {
    const ordem = Number(body.ordem ?? 0);
    data.ordem = Number.isFinite(ordem) ? ordem : 0;
  }

  if (!parcial || body.limite !== undefined) {
    data.limite = validarLimite(body.limite);
  }

  if (!parcial || body.ativo !== undefined) {
    data.ativo = body.ativo === true || body.ativo === 1 || body.ativo === '1';
  }

  const logoUrl = body.logo_url ?? body.logoUrl;
  if (!parcial || logoUrl !== undefined) {
    const value = logoUrl == null ? '' : String(logoUrl).trim();
    if (value.length > 500) {
      const err = new Error('URL do logo deve ter no máximo 500 caracteres.');
      err.status = 400;
      throw err;
    }
    data.logoUrl = value || null;
  }

  if (!parcial || body.rotulo !== undefined) {
    const value = body.rotulo == null ? '' : String(body.rotulo).trim();
    if (value.length > 60) {
      const err = new Error('Rótulo deve ter no máximo 60 caracteres.');
      err.status = 400;
      throw err;
    }
    data.rotulo = value || null;
  }

  return data;
}

async function listarProximos(req, res) {
  try {
    const resultado = await eventosService.listarProximos();
    res.json(resultado);
  } catch (err) {
    handleError(res, err);
  }
}

async function listarAgenda(req, res) {
  try {
    const params = parseAgendaQuery(req.query);
    const resultado = await eventosService.listarAgenda(params);
    res.json(resultado);
  } catch (err) {
    handleError(res, err);
  }
}

async function listarParsers(req, res) {
  try {
    res.json(parsers.listarTipos());
  } catch (err) {
    handleError(res, err);
  }
}

async function listarFontesAdmin(req, res) {
  try {
    const busca = req.query.busca;
    const fontes = await fontesRepo.listarAdmin({ busca });
    res.json(fontes);
  } catch (err) {
    handleError(res, err);
  }
}

async function obterFonte(req, res) {
  try {
    const id = Number(req.params.id);
    const fonte = await fontesRepo.buscarPorId(id);
    if (!fonte) {
      return res.status(404).json({ mensagem: 'Fonte não encontrada.' });
    }
    res.json(fonte);
  } catch (err) {
    handleError(res, err);
  }
}

async function criarFonte(req, res) {
  try {
    const data = bodyParaFonte(req.body);
    data.ativo = req.body.ativo === undefined ? true : data.ativo ?? true;

    const existente = await fontesRepo.buscarPorCodigo(data.codigo);
    if (existente) {
      return res.status(409).json({ mensagem: 'Já existe uma fonte com este código.' });
    }

    const criada = await fontesRepo.criar(data);
    eventosService.invalidarCache();
    await audit(req, 'EVENTOS_FONTE_CRIAR');
    res.status(201).json(criada);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ mensagem: 'Já existe uma fonte com este código.' });
    }
    handleError(res, err);
  }
}

async function atualizarFonte(req, res) {
  try {
    const id = Number(req.params.id);
    const atual = await fontesRepo.buscarPorId(id);
    if (!atual) {
      return res.status(404).json({ mensagem: 'Fonte não encontrada.' });
    }

    const data = bodyParaFonte(req.body, { parcial: true });
    const atualizada = await fontesRepo.atualizar(id, data);
    if (
      data.logoUrl !== undefined &&
      atual.logoUrl &&
      atual.logoUrl !== atualizada?.logoUrl
    ) {
      await cleanupOrphanFonteLogo(atual.logoUrl, fontesRepo);
    }
    eventosService.invalidarCache(atual.codigo);
    if (atualizada?.codigo && atualizada.codigo !== atual.codigo) {
      eventosService.invalidarCache(atualizada.codigo);
    }
    await audit(req, 'EVENTOS_FONTE_ATUALIZAR');
    res.json(atualizada);
  } catch (err) {
    handleError(res, err);
  }
}

async function removerFonte(req, res) {
  try {
    const id = Number(req.params.id);
    const atual = await fontesRepo.buscarPorId(id);
    if (!atual) {
      return res.status(404).json({ mensagem: 'Fonte não encontrada.' });
    }

    await fontesRepo.remover(id);
    if (atual.logoUrl) {
      await cleanupOrphanFonteLogo(atual.logoUrl, fontesRepo, id);
    }
    eventosService.invalidarCache(atual.codigo);
    await audit(req, 'EVENTOS_FONTE_REMOVER');
    res.json({ ok: true });
  } catch (err) {
    handleError(res, err);
  }
}

async function uploadLogo(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ mensagem: 'Arquivo de imagem é obrigatório.' });
    }

    const inputPath = req.file.path;
    const { outputPath, compactado, largura, altura } = await processLogoImage(
      inputPath,
      req.file.originalname
    );

    const filename = path.basename(outputPath);
    const url = `${STORED_URL_PREFIX}${filename}`;

    return res.json({
      url,
      compactado,
      largura,
      altura,
    });
  } catch (err) {
    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    return res.status(err.status || 500).json({ mensagem: err.message });
  }
}

async function serveLogoFile(req, res) {
  try {
    ensureEventosFontesLogosDir();
    const filename = path.basename(req.params.filename || '');
    if (!filename || filename.includes('..')) {
      return res.status(400).json({ mensagem: 'Arquivo inválido.' });
    }

    const filePath = path.join(env.eventosFontesLogosDir, filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ mensagem: 'Arquivo não encontrado.' });
    }

    res.set('Cache-Control', 'public, max-age=86400');
    return res.sendFile(filePath);
  } catch (err) {
    return res.status(err.status || 500).json({ mensagem: err.message });
  }
}

async function testarFonte(req, res) {
  try {
    const id = Number(req.params.id);
    const fonte = await fontesRepo.buscarPorId(id);
    if (!fonte) {
      return res.status(404).json({ mensagem: 'Fonte não encontrada.' });
    }

    const resultado = await eventosService.testarFonte(fonte);
    res.json(resultado);
  } catch (err) {
    handleError(res, err);
  }
}

module.exports = {
  listarProximos,
  listarAgenda,
  listarParsers,
  listarFontesAdmin,
  obterFonte,
  criarFonte,
  atualizarFonte,
  removerFonte,
  testarFonte,
  uploadLogo,
  serveLogoFile,
};
