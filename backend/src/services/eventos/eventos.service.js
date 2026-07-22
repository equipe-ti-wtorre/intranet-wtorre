const { env } = require('../../config/env');
const fontesRepo = require('../../repositories/eventos-fontes.repository');
const parsers = require('./parsers');

const cache = new Map();

function cacheKey(codigo) {
  return codigo;
}

function getTtlMs() {
  return Math.max(1, env.eventosCacheTtlMin) * 60 * 1000;
}

function invalidarCache(codigo) {
  if (codigo) {
    cache.delete(cacheKey(codigo));
    return;
  }
  cache.clear();
}

function ordenarEventos(lista) {
  return [...lista].sort((a, b) => {
    if (a.dataIso && b.dataIso) return a.dataIso.localeCompare(b.dataIso);
    if (a.dataIso) return -1;
    if (b.dataIso) return 1;
    return (a.titulo || '').localeCompare(b.titulo || '', 'pt-BR');
  });
}

async function buscarDaFonte(fonte, { ignorarCache = false } = {}) {
  const key = cacheKey(fonte.codigo);
  const now = Date.now();

  if (!ignorarCache) {
    const cached = cache.get(key);
    if (cached && cached.expiresAt > now) {
      return cached.eventos;
    }
  }

  const parser = parsers.getParser(fonte.parserTipo);
  if (!parser) {
    const err = new Error(`Parser "${fonte.parserTipo}" não registrado.`);
    err.status = 500;
    throw err;
  }

  let eventos;
  try {
    eventos = await parser.parse(fonte);
  } catch (err) {
    const cached = cache.get(key);
    if (cached?.eventos?.length) {
      console.warn(`[eventos] Usando cache stale para ${fonte.codigo}:`, err.message);
      return cached.eventos;
    }
    throw err;
  }

  eventos = eventos.map((ev) => ({
    ...ev,
    logoUrl: fonte.logoUrl || null,
    rotulo: fonte.rotulo || null,
  }));

  cache.set(key, {
    eventos,
    expiresAt: now + getTtlMs(),
    atualizadoEm: new Date().toISOString(),
  });

  return eventos;
}

function hojeIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function filtrarFuturos(eventos) {
  const hoje = hojeIso();
  const comData = [];
  const semData = [];

  for (const ev of eventos) {
    if (ev.dataIso) {
      if (ev.dataIso >= hoje) {
        comData.push(ev);
      }
    } else {
      semData.push(ev);
    }
  }

  return [...ordenarEventos(comData), ...ordenarEventos(semData)];
}

async function coletarEventosDasFontes() {
  const fontes = await fontesRepo.listarAtivas();
  if (!fontes.length) {
    return { eventos: [], fontes: [] };
  }

  const resultados = await Promise.allSettled(fontes.map((f) => buscarDaFonte(f)));
  const eventos = [];

  resultados.forEach((result, index) => {
    const fonte = fontes[index];
    if (result.status === 'fulfilled') {
      eventos.push(...result.value);
    } else {
      console.error(`[eventos] Falha na fonte ${fonte.codigo}:`, result.reason?.message);
    }
  });

  return {
    eventos,
    fontes: fontes.map((f) => f.codigo),
  };
}

function filtrarPorIntervalo(eventos, de, ate) {
  return ordenarEventos(
    eventos.filter((ev) => ev.dataIso && ev.dataIso >= de && ev.dataIso <= ate)
  );
}

function filtrarPorMes(eventos, ano, mes) {
  const prefix = `${ano}-${String(mes).padStart(2, '0')}`;
  return ordenarEventos(eventos.filter((ev) => ev.dataIso && ev.dataIso.startsWith(prefix)));
}

function resolverLimiteAgenda(limite, comFiltro) {
  const teto = comFiltro ? 200 : 100;
  const padrao = comFiltro ? 200 : env.eventosAgendaLimite;
  if (limite != null && Number.isFinite(Number(limite))) {
    return Math.min(Math.max(1, Math.floor(Number(limite))), teto);
  }
  return padrao;
}
async function listarProximos() {
  const { eventos, fontes } = await coletarEventosDasFontes();
  const ordenados = ordenarEventos(eventos).slice(0, env.eventosLimite);
  const atualizadoEm = new Date().toISOString();

  return {
    eventos: ordenados,
    atualizadoEm,
    fontes,
  };
}

async function listarAgenda({ limite, de, ate, ano, mes } = {}) {
  const temIntervalo = Boolean(de && ate);
  const temMes = ano != null && mes != null;
  const comFiltro = temIntervalo || temMes;
  const max = resolverLimiteAgenda(limite, comFiltro);

  const { eventos, fontes } = await coletarEventosDasFontes();
  let filtrados;

  if (temIntervalo) {
    filtrados = filtrarPorIntervalo(eventos, de, ate);
  } else if (temMes) {
    filtrados = filtrarPorMes(eventos, Number(ano), Number(mes));
  } else {
    filtrados = filtrarFuturos(eventos);
  }

  const atualizadoEm = new Date().toISOString();

  return {
    eventos: filtrados.slice(0, max),
    atualizadoEm,
    fontes,
  };
}

async function testarFonte(fonte) {
  const eventos = await buscarDaFonte(fonte, { ignorarCache: true });
  return {
    fonte: {
      id: fonte.id,
      codigo: fonte.codigo,
      nome: fonte.nome,
      url: fonte.url,
      parserTipo: fonte.parserTipo,
    },
    total: eventos.length,
    eventos: eventos.slice(0, 20),
    testadoEm: new Date().toISOString(),
  };
}

module.exports = {
  listarProximos,
  listarAgenda,
  testarFonte,
  invalidarCache,
  buscarDaFonte,
};
