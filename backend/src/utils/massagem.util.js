function makeChave(eventoId, data, hora) {
  return `${eventoId}_${data}_${hora}`;
}

function parseChave(chave) {
  const parts = String(chave || '').split('_');
  if (parts.length < 3) return null;
  const hora = parts.pop();
  const data = parts.pop();
  const eventoId = parts.join('_');
  if (!eventoId || !data || !hora) return null;
  return { eventoId, data, hora };
}

function isPastSlot(data, hora) {
  const [y, m, d] = String(data).split('-').map(Number);
  const [hh, mm] = String(hora).split(':').map(Number);
  if (![y, m, d, hh, mm].every((n) => Number.isFinite(n))) return true;
  const slot = new Date(y, m - 1, d, hh, mm, 0, 0);
  return slot.getTime() < Date.now();
}

function horaFimSlot(hora, duracaoMin) {
  const [hh, mm] = String(hora).split(':').map(Number);
  const dur = Number(duracaoMin);
  const minutes = Number.isFinite(dur) && dur > 0 ? dur : 50;
  if (![hh, mm].every((n) => Number.isFinite(n))) return '';
  const t = hh * 60 + mm + minutes;
  const h = Math.floor(t / 60) % 24;
  const m = t % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Minutos extras no tablet após o término da sessão, antes de encerrar o evento. */
const GRACE_ENCERRAMENTO_MIN = 10;

/** Minutos após o início da sessão antes de permitir registrar falta no tablet. */
const FALTA_CARENCIA_MIN = 5;

function tsDataHora(data, hora) {
  const [y, m, d] = String(data).split('-').map(Number);
  const [hh, mm] = String(hora).split(':').map(Number);
  if (![y, m, d, hh, mm].every((n) => Number.isFinite(n))) return null;
  return new Date(y, m - 1, d, hh, mm, 0, 0).getTime();
}

const TZ_SAO_PAULO = 'America/Sao_Paulo';

function hojeIsoSaoPaulo(now = Date.now()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ_SAO_PAULO,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(now));
}

function offsetMsEmFuso(utcMs, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(utcMs));
  const num = (type) => Number(parts.find((p) => p.type === type).value);
  const asUTC = Date.UTC(
    num('year'),
    num('month') - 1,
    num('day'),
    num('hour'),
    num('minute'),
    num('second')
  );
  return asUTC - utcMs;
}

/** Instante UTC do relógio de parede em America/Sao_Paulo. */
function tsDataHoraSaoPaulo(data, hora) {
  const dataStr = String(data || '').slice(0, 10);
  const h = String(hora || '').trim().slice(0, 5);
  const [y, mo, d] = dataStr.split('-').map(Number);
  const [hh, mm] = h.split(':').map(Number);
  if (![y, mo, d, hh, mm].every((n) => Number.isFinite(n))) return null;
  const utcGuess = Date.UTC(y, mo - 1, d, hh, mm, 0, 0);
  return utcGuess - offsetMsEmFuso(utcGuess, TZ_SAO_PAULO);
}

/** Janela [hora, hora+duracaoMin + grace). Relógio local, igual a isPastSlot. */
function isDentroDoHorario(data, hora, duracaoMin, now = Date.now(), { graceMin = 0 } = {}) {
  const start = tsDataHora(data, hora);
  if (start == null) return false;
  const minutes = duracaoMinSafe(duracaoMin);
  const grace = Number(graceMin);
  const extra = Number.isFinite(grace) && grace > 0 ? grace * 60 * 1000 : 0;
  const end = start + minutes * 60 * 1000 + extra;
  return now >= start && now < end;
}

/** Falta após carência, até o término da sessão + 10 min de tolerância. */
function isDentroDoHorarioFalta(data, hora, duracaoMin, now = Date.now()) {
  const start = tsDataHora(data, hora);
  if (start == null) return false;
  const minutes = duracaoMinSafe(duracaoMin);
  const inicioFalta = start + FALTA_CARENCIA_MIN * 60 * 1000;
  const end = start + (minutes + GRACE_ENCERRAMENTO_MIN) * 60 * 1000;
  return now >= inicioFalta && now < end;
}

/** Último horário de início: Fim cadastrado ou último item de `horarios`. */
function ultimoInicioEvento(evento) {
  const fim = normalizeHora(evento?.horarioFim);
  if (fim) return fim;
  const hrs = [...(evento?.horarios || [])]
    .map((h) => normalizeHora(h))
    .filter(Boolean)
    .sort();
  return hrs.length ? hrs[hrs.length - 1] : null;
}

/**
 * Instante em que o evento deve ir para inativo.
 * Sem reserva no último horário: no Fim (último início).
 * Última reserva presente/falta: no término da sessão.
 * Última reserva ainda ok: término + 10 min.
 */
function tsEncerrarEvento(evento, lastReserva) {
  const hora = ultimoInicioEvento(evento);
  if (!hora || !evento?.data) return null;
  const start = tsDataHoraSaoPaulo(toDateStr(evento.data), hora);
  if (start == null) return null;
  const sessionEnd = start + duracaoMinSafe(evento.duracaoMin) * 60 * 1000;
  if (!lastReserva) return start;
  if (lastReserva.status === 'presente' || lastReserva.status === 'falta') return sessionEnd;
  return sessionEnd + GRACE_ENCERRAMENTO_MIN * 60 * 1000;
}

function deveEncerrarEvento(evento, lastReserva, now = Date.now()) {
  const ts = tsEncerrarEvento(evento, lastReserva);
  return ts != null && now >= ts;
}

function toDateStr(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(value).slice(0, 10);
}

function parseHorarios(raw) {
  if (Array.isArray(raw)) return raw.map((h) => String(h).trim()).filter(Boolean);
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map((h) => String(h).trim()).filter(Boolean);
    } catch {
      return raw
        .split(',')
        .map((h) => h.trim())
        .filter(Boolean);
    }
  }
  return [];
}

const HORA_RE = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/;

function normalizeHora(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  const m = s.match(HORA_RE);
  if (!m) return null;
  return `${m[1]}:${m[2]}`;
}

function parseHoraMin(raw) {
  const h = normalizeHora(raw);
  if (!h) return null;
  const [hh, mm] = h.split(':').map(Number);
  return hh * 60 + mm;
}

function parsePausas(raw) {
  let arr = raw;
  if (arr == null || arr === '') return [];
  if (typeof arr === 'string') {
    try {
      arr = JSON.parse(arr);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue;
    const nome = String(item.nome || '').trim();
    const inicio = normalizeHora(item.inicio);
    const fim = normalizeHora(item.fim);
    if (!nome || !inicio || !fim) continue;
    out.push({ nome: nome.slice(0, 80), inicio, fim });
  }
  return out;
}

function janelasSobrepoem(aIni, aFim, bIni, bFim) {
  return aIni < bFim && aFim > bIni;
}

function duracaoMinSafe(duracaoMin, fallback = 50) {
  const dur = Number(duracaoMin);
  return Number.isFinite(dur) && dur > 0 ? dur : fallback;
}

/** Até é o último horário ainda em pausa; o bloqueio vai até Até + duração da sessão. */
function fimExclusivoPausaMin(pFimMin, duracaoMin) {
  return pFimMin + duracaoMinSafe(duracaoMin);
}

function horaFimExclusivoPausa(pausa, duracaoMin) {
  const fim = parseHoraMin(pausa?.fim);
  if (fim == null) return pausa?.fim || '';
  return formatMinutos(fimExclusivoPausaMin(fim, duracaoMin));
}

/**
 * Pausas antigas de 1 slot eram gravadas como De–Até exclusivo (11:00–11:15).
 * No modelo inclusivo isso vira De === Até (11:00–11:00).
 */
function coercePausasModeloInclusivo(pausas, duracaoMin) {
  const dur = duracaoMinSafe(duracaoMin);
  return (pausas || []).map((p) => {
    const ini = parseHoraMin(p.inicio);
    const fim = parseHoraMin(p.fim);
    if (ini == null || fim == null) return p;
    if (fim - ini === dur) {
      return { ...p, fim: p.inicio };
    }
    return p;
  });
}

function normalizePausas(raw, { inicio, fim, duracaoMin } = {}) {
  let arr = raw;
  if (arr == null || arr === '') arr = [];
  if (typeof arr === 'string') {
    try {
      arr = JSON.parse(arr);
    } catch {
      throw httpError(400, 'Pausas inválidas.');
    }
  }
  if (!Array.isArray(arr)) throw httpError(400, 'Pausas inválidas.');

  const dur = duracaoMinSafe(duracaoMin);
  const winIni = inicio ? parseHoraMin(inicio) : null;
  const winFim = fim ? parseHoraMin(fim) : null;
  if ((inicio && winIni == null) || (fim && winFim == null)) {
    throw httpError(400, 'Horário de início/fim do evento inválido.');
  }
  if (winIni != null && winFim != null && winIni >= winFim) {
    throw httpError(400, 'Horário de início deve ser anterior ao fim.');
  }

  const normalized = [];
  for (const item of arr) {
    if (!item || typeof item !== 'object') throw httpError(400, 'Pausa inválida.');
    const nome = String(item.nome || '').trim();
    const pInicio = normalizeHora(item.inicio);
    const pFim = normalizeHora(item.fim);
    if (!nome && !item.inicio && !item.fim) continue;
    if (!nome) throw httpError(400, 'Informe o nome de cada pausa.');
    if (!pInicio || !pFim) {
      throw httpError(400, `Pausa "${nome}": informe os horários De e Até.`);
    }
    const pIni = parseHoraMin(pInicio);
    const pFimMin = parseHoraMin(pFim);
    if (pIni == null || pFimMin == null || pIni > pFimMin) {
      throw httpError(400, `Pausa "${nome}": o horário De deve ser anterior ou igual ao Até.`);
    }
    const pFimEx = fimExclusivoPausaMin(pFimMin, dur);
    if (winIni != null && winFim != null && (pIni < winIni || pFimEx > winFim)) {
      throw httpError(400, `Pausa "${nome}" deve ficar entre ${inicio} e ${fim}.`);
    }
    normalized.push({
      nome: nome.slice(0, 80),
      inicio: pInicio,
      fim: pFim,
      _ini: pIni,
      _fimEx: pFimEx,
    });
  }

  const sorted = [...normalized].sort((a, b) => a._ini - b._ini);
  for (let i = 1; i < sorted.length; i += 1) {
    if (janelasSobrepoem(sorted[i - 1]._ini, sorted[i - 1]._fimEx, sorted[i]._ini, sorted[i]._fimEx)) {
      throw httpError(400, 'As pausas não podem se sobrepor.');
    }
  }

  return normalized.map(({ nome, inicio: ini, fim: f }) => ({ nome, inicio: ini, fim: f }));
}

function horarioSobrepoePausa(hora, duracaoMin, pausas) {
  const start = parseHoraMin(hora);
  if (start == null) return false;
  const minutes = duracaoMinSafe(duracaoMin);
  const end = start + minutes;
  return (pausas || []).some((p) => {
    const pIni = parseHoraMin(p.inicio);
    const pFim = parseHoraMin(p.fim);
    if (pIni == null || pFim == null) return false;
    return janelasSobrepoem(start, end, pIni, fimExclusivoPausaMin(pFim, minutes));
  });
}

function formatMinutos(min) {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Recupera pausas de eventos que gravaram o buraco em `horarios` mas não o JSON `pausas`. */
function inferPausasFromHorarios(horarios, duracaoMin) {
  const dur = Number(duracaoMin);
  const minutes = Number.isFinite(dur) && dur > 0 ? dur : 50;
  const hrs = [...(horarios || [])]
    .map((h) => ({ min: parseHoraMin(h) }))
    .filter((h) => h.min != null)
    .sort((a, b) => a.min - b.min);
  if (hrs.length < 2) return [];

  const gaps = [];
  let adjacent = 0;
  for (let i = 0; i < hrs.length - 1; i += 1) {
    const end = hrs[i].min + minutes;
    const next = hrs[i + 1].min;
    if (next === end) adjacent += 1;
    else if (next > end) {
      const lastBlocked = next - minutes;
      if (lastBlocked >= end) {
        gaps.push({ nome: 'Pausa', inicio: formatMinutos(end), fim: formatMinutos(lastBlocked) });
      }
    }
  }
  if (!adjacent || !gaps.length) return [];
  return gaps;
}

function userDisplayName(user) {
  return user?.nome_completo || user?.nome || user?.username || user?.email || 'Usuário';
}

function httpError(status, mensagem) {
  const err = new Error(mensagem);
  err.status = status;
  return err;
}

module.exports = {
  GRACE_ENCERRAMENTO_MIN,
  FALTA_CARENCIA_MIN,
  makeChave,
  parseChave,
  isPastSlot,
  horaFimSlot,
  isDentroDoHorario,
  isDentroDoHorarioFalta,
  ultimoInicioEvento,
  tsEncerrarEvento,
  deveEncerrarEvento,
  hojeIsoSaoPaulo,
  toDateStr,
  parseHorarios,
  normalizeHora,
  parseHoraMin,
  parsePausas,
  inferPausasFromHorarios,
  coercePausasModeloInclusivo,
  horaFimExclusivoPausa,
  normalizePausas,
  horarioSobrepoePausa,
  userDisplayName,
  httpError,
};
