const repo = require('../repositories/rustdesk.repository');
const bridge = require('./rustdesk-bridge.client');
const syncService = require('./rustdesk-sync.service');
const fs = require('fs');
const path = require('path');
const { env } = require('../config/env');

const MOTIVO_MENSAGEM = {
  arquivo_ausente: 'Arquivo de métricas ausente no coletor.',
  formato_invalido: 'Formato das métricas inválido.',
  dado_obsoleto: 'Métricas desatualizadas no coletor.',
};

function calcularEstado(dispositivo) {
  if (dispositivo.servico_estado === 'ausente') return 'sem_servico';
  if (!dispositivo.ultimo_registro) return 'nunca_registrou';
  return dispositivo.presente_no_hbbs ? 'no_servidor' : 'ausente_hbbs';
}

function comEstado(dispositivo) {
  if (!dispositivo) return null;
  return { ...dispositivo, estado: calcularEstado(dispositivo) };
}

function mapContainer(c) {
  if (!c || typeof c !== 'object') {
    return { memoria_bytes: null, memoria_mb: null, ativo: null };
  }
  return {
    memoria_bytes: c.memoriaBytes == null ? null : Number(c.memoriaBytes),
    memoria_mb: c.memoriaMB == null ? null : Number(c.memoriaMB),
    ativo: c.ativo == null ? null : !!c.ativo,
  };
}

function mapMetricasDisponiveis(body) {
  return {
    disponivel: true,
    motivo: null,
    mensagem: null,
    coletado_em: body.coletadoEm || null,
    defasagem_segundos: body.defasagemSegundos == null ? null : Number(body.defasagemSegundos),
    containers: {
      hbbs: mapContainer(body.containers?.hbbs),
      hbbr: mapContainer(body.containers?.hbbr),
    },
    relay: {
      sessoes_ativas:
        body.relay?.sessoesAtivas == null ? null : Number(body.relay.sessoesAtivas),
      egress_bytes_acumulado:
        body.relay?.egressBytesAcumulado == null
          ? null
          : Number(body.relay.egressBytesAcumulado),
    },
    host: {
      uptime_segundos: body.host?.uptimeSegundos == null ? null : Number(body.host.uptimeSegundos),
      carga_media_1min:
        body.host?.cargaMedia1min == null ? null : Number(body.host.cargaMedia1min),
    },
  };
}

function mapMetricasIndisponiveis(body, fallbackMotivo = 'arquivo_ausente') {
  const motivo = body?.motivo || fallbackMotivo;
  return {
    disponivel: false,
    motivo,
    mensagem: MOTIVO_MENSAGEM[motivo] || 'Métricas indisponíveis.',
    coletado_em: body?.coletadoEm || null,
    defasagem_segundos: null,
    containers: null,
    relay: null,
    host: null,
  };
}

async function obterMetricas() {
  const res = await bridge.getMetricas();
  if (res.status === 200 && res.body && !res.body.erro) {
    return mapMetricasDisponiveis(res.body);
  }
  if (res.status === 503 || res.body?.erro === 'metricas_indisponiveis') {
    return mapMetricasIndisponiveis(res.body);
  }
  return mapMetricasIndisponiveis(
    { motivo: 'arquivo_ausente' },
    res.erroRede ? 'arquivo_ausente' : 'formato_invalido'
  );
}

async function obterResumo() {
  const [healthRes, statsRes, metricas, sync] = await Promise.all([
    bridge.getHealth(),
    bridge.getStats(),
    obterMetricas(),
    repo.ultimaSync(),
  ]);

  const healthOk = healthRes.status === 200 && healthRes.body;
  const statsOk = statsRes.status === 200 && statsRes.body;

  return {
    bridge: {
      alcancavel: healthOk,
      ok: healthOk ? !!healthRes.body.ok : null,
      sqlite_acessivel: healthOk ? !!healthRes.body.sqliteAcessivel : null,
      total_peers: healthOk && healthRes.body.totalPeers != null ? Number(healthRes.body.totalPeers) : null,
      metricas_disponiveis: healthOk ? !!healthRes.body.metricasDisponiveis : null,
      versao: healthOk ? healthRes.body.versao || null : null,
      mensagem: healthOk ? null : healthRes.body?.mensagem || 'Bridge indisponível.',
    },
    stats: statsOk
      ? {
          total: Number(statsRes.body.total) || 0,
          registrados_ultima_hora: Number(statsRes.body.registradosUltimaHora) || 0,
          mais_antigo: statsRes.body.maisAntigo || null,
          mais_recente: statsRes.body.maisRecente || null,
        }
      : null,
    metricas,
    sync,
  };
}

function parseRustdeskId(raw) {
  const id = String(raw ?? '').trim();
  if (!id) return null;
  return id;
}

async function resolverEntidadeId(valor) {
  if (valor == null || valor === '') return null;
  if (typeof valor === 'number' || /^\d+$/.test(String(valor).trim())) {
    const row = await repo.findEntidadeById(Number(valor));
    if (!row) {
      const err = new Error('Entidade não encontrada.');
      err.status = 400;
      throw err;
    }
    return row.id;
  }
  const row = await repo.findEntidadeByNomeOuSlug(valor);
  if (!row) {
    const err = new Error(`Entidade não encontrada: ${valor}`);
    err.status = 400;
    throw err;
  }
  return row.id;
}

function camposCadastro(body) {
  return {
    hostname: body.hostname,
    entidade_id: body.entidade_id,
    setor: body.setor,
    tipo: body.tipo,
    localizacao: body.localizacao,
    modo_acesso: body.modo_acesso,
    cofre_ref: body.cofre_ref,
    servico_estado: body.servico_estado,
    versao_cliente: body.versao_cliente,
    observacao: body.observacao,
  };
}

async function listarDispositivos(query) {
  const ativoRaw = query.ativo;
  let ativo;
  if (ativoRaw === '0' || ativoRaw === 'false') ativo = false;
  else if (ativoRaw === '1' || ativoRaw === 'true') ativo = true;
  else if (ativoRaw === 'todos') ativo = undefined;
  else ativo = true;

  const result = await repo.listDispositivos({
    busca: query.busca || '',
    entidadeId: query.entidade_id || query.entidadeId,
    tipo: query.tipo || '',
    ativo,
    page: query.page,
    pageSize: query.page_size || query.pageSize,
  });
  return {
    ...result,
    itens: result.itens.map(comEstado),
  };
}

async function obterDispositivo(id) {
  const row = await repo.findById(id);
  if (!row) {
    const err = new Error('Dispositivo não encontrado.');
    err.status = 404;
    throw err;
  }
  return comEstado(row);
}

async function criarDispositivo(body) {
  const rustdeskId = parseRustdeskId(body.rustdesk_id || body.rustdeskId);
  if (!rustdeskId) {
    const err = new Error('rustdesk_id é obrigatório.');
    err.status = 400;
    throw err;
  }

  const existente = await repo.findByRustdeskId(rustdeskId);
  if (existente) {
    const err = new Error(
      existente.ativo
        ? 'Já existe um dispositivo com este ID RustDesk.'
        : 'Já existe um dispositivo inativo com este ID. Reative-o pela edição.'
    );
    err.status = 409;
    throw err;
  }

  const data = camposCadastro(body);
  if (data.entidade_id !== undefined) {
    data.entidade_id = await resolverEntidadeId(data.entidade_id);
  }

  const created = await repo.createDispositivo({
    ...data,
    rustdesk_id: rustdeskId,
  });
  await repo.removeOrfao(rustdeskId);
  return comEstado(created);
}

async function atualizarDispositivo(id, body) {
  const existing = await repo.findById(id);
  if (!existing) {
    const err = new Error('Dispositivo não encontrado.');
    err.status = 404;
    throw err;
  }

  const data = camposCadastro(body);
  if (body.ativo !== undefined) data.ativo = body.ativo;
  if (data.entidade_id !== undefined) {
    data.entidade_id = await resolverEntidadeId(data.entidade_id);
  }

  const updated = await repo.updateDispositivo(id, data);
  return comEstado(updated);
}

async function excluirDispositivo(id) {
  const existing = await repo.findById(id);
  if (!existing) {
    const err = new Error('Dispositivo não encontrado.');
    err.status = 404;
    throw err;
  }
  return comEstado(await repo.softDelete(id));
}

async function listarOrfaos() {
  return repo.listOrfaos();
}

async function vincularOrfao(rustdeskIdRaw, body) {
  const rustdeskId = parseRustdeskId(rustdeskIdRaw);
  if (!rustdeskId) {
    const err = new Error('ID RustDesk inválido.');
    err.status = 400;
    throw err;
  }

  const orfao = await repo.findOrfao(rustdeskId);
  if (!orfao) {
    const err = new Error('Órfão não encontrado.');
    err.status = 404;
    throw err;
  }

  const peerRes = await bridge.getPeer(rustdeskId);
  if (peerRes.status === 404) {
    const err = new Error('Peer não encontrado no servidor RustDesk.');
    err.status = 404;
    throw err;
  }
  if (peerRes.status !== 200) {
    const err = new Error('Não foi possível confirmar o ID no servidor RustDesk. Tente novamente.');
    err.status = 503;
    throw err;
  }

  const created = await criarDispositivo({
    ...body,
    rustdesk_id: rustdeskId,
  });

  await repo.updateDispositivo(created.id, {
    criado_em_hbbs: peerRes.body?.criadoEm || orfao.criado_em_hbbs,
    ultimo_registro: peerRes.body?.ultimoRegistro || orfao.ultimo_registro,
    presente_no_hbbs: true,
  });

  return obterDispositivo(created.id);
}

function normHeader(h) {
  return String(h || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

const HEADER_MAP = {
  rustdeskid: 'rustdesk_id',
  id: 'rustdesk_id',
  idrustdesk: 'rustdesk_id',
  hostname: 'hostname',
  host: 'hostname',
  nome: 'hostname',
  entidadeid: 'entidade_id',
  entidade: 'entidade_id',
  pagina: 'entidade_id',
  setor: 'setor',
  tipo: 'tipo',
  localizacao: 'localizacao',
  modoacesso: 'modo_acesso',
  cofreref: 'cofre_ref',
  cofre: 'cofre_ref',
  servicoestado: 'servico_estado',
  servico: 'servico_estado',
  estado: 'servico_estado',
  versaocliente: 'versao_cliente',
  versao: 'versao_cliente',
  observacao: 'observacao',
  obs: 'observacao',
};

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ';' && !inQuotes) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

async function importarCsv(buffer) {
  if (!buffer || !buffer.length) {
    const err = new Error('Arquivo CSV vazio.');
    err.status = 400;
    throw err;
  }

  let text;
  try {
    text = new TextDecoder('windows-1252').decode(buffer);
  } catch {
    text = buffer.toString('latin1');
  }

  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) {
    const err = new Error('CSV sem linhas de dados.');
    err.status = 400;
    throw err;
  }

  const headers = parseCsvLine(lines[0]).map(normHeader);
  const colIndex = {};
  headers.forEach((h, i) => {
    if (h === 'senhagravada' || h === 'senha') return;
    const campo = HEADER_MAP[h];
    if (campo) colIndex[campo] = i;
  });

  if (colIndex.rustdesk_id == null) {
    const err = new Error('CSV precisa da coluna de ID RustDesk.');
    err.status = 400;
    throw err;
  }

  let criados = 0;
  let atualizados = 0;
  let ignorados = 0;
  const erros = [];

  for (let n = 1; n < lines.length; n += 1) {
    const cols = parseCsvLine(lines[n]);
    const rustdeskId = parseRustdeskId(cols[colIndex.rustdesk_id]);
    if (!rustdeskId) {
      ignorados += 1;
      continue;
    }

    const pick = (campo) => {
      const i = colIndex[campo];
      if (i == null) return undefined;
      const v = cols[i];
      return v === '' ? null : v;
    };

    try {
      let entidadeId = pick('entidade_id');
      if (entidadeId != null) {
        entidadeId = await resolverEntidadeId(entidadeId);
      }

      const payload = {
        hostname: pick('hostname'),
        entidade_id: entidadeId,
        setor: pick('setor'),
        tipo: pick('tipo'),
        localizacao: pick('localizacao'),
        modo_acesso: pick('modo_acesso'),
        cofre_ref: pick('cofre_ref'),
        servico_estado: pick('servico_estado'),
        versao_cliente: pick('versao_cliente'),
        observacao: pick('observacao'),
      };

      const existente = await repo.findByRustdeskId(rustdeskId);
      if (existente) {
        const data = {};
        for (const [k, v] of Object.entries(payload)) {
          if (v !== undefined) data[k] = v;
        }
        await repo.updateDispositivo(existente.id, data);
        atualizados += 1;
      } else {
        await repo.createDispositivo({ ...payload, rustdesk_id: rustdeskId });
        await repo.removeOrfao(rustdeskId);
        criados += 1;
      }
    } catch (err) {
      erros.push({ linha: n + 1, rustdesk_id: rustdeskId, mensagem: err.message });
    }
  }

  return { criados, atualizados, ignorados, erros };
}

async function sincronizar() {
  return syncService.sincronizar();
}

async function listarSyncLog(limit) {
  return repo.listSyncLog(limit);
}

function resolverInstalador() {
  const candidatos = [
    env.rustdeskInstallerPath,
    path.join(__dirname, '..', '..', 'storage', 'rustdesk', 'Rustdesk.zip'),
    path.join(__dirname, '..', '..', '..', 'frontend', 'public', 'downloads', 'Rustdesk.zip'),
  ];
  for (const p of candidatos) {
    if (!p) continue;
    try {
      if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
    } catch {
      /* ignora caminho inválido */
    }
  }
  return null;
}

module.exports = {
  obterResumo,
  obterMetricas,
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
  resolverInstalador,
};
