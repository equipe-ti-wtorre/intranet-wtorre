const repo = require('../repositories/massagem.repository');
const mail = require('./massagem-mail.service');
const { ultimoInicioEvento, deveEncerrarEvento, hojeIsoSaoPaulo, toDateStr } = require('../utils/massagem.util');

const ONE_HOUR = 60 * 60 * 1000;
const WINDOW = 5 * 60 * 1000;

async function processarLembretes() {
  const pendentes = await repo.listLembretesPendentes();
  const now = Date.now();
  for (const r of pendentes) {
    const [y, m, d] = r.data.split('-').map(Number);
    const [hh, mm] = r.hora.split(':').map(Number);
    const slotTs = new Date(y, m - 1, d, hh, mm).getTime();
    const diff = slotTs - now;
    if (diff > 0 && diff <= ONE_HOUR && diff > ONE_HOUR - WINDOW) {
      await mail.emailLembrete(r.email, {
        data: r.data,
        hora: r.hora,
        evento: r.evento,
        nome: r.nome || '',
      });
      await repo.markLembreteEnviado(r.eventoId, r.data, r.hora);
    }
  }
}

async function encerrarEventoSeDevido(evento) {
  if (!evento || evento.status !== 'ativo') return false;
  const data = toDateStr(evento.data);
  if (data && data < hojeIsoSaoPaulo()) {
    await repo.updateEvento(evento.id, { status: 'inativo' });
    console.log(`[massagem-encerramento] evento ${evento.id} inativo`);
    return true;
  }
  const hora = ultimoInicioEvento(evento);
  if (!hora) return false;
  const lastReserva = await repo.getReservaBySlot(evento.id, evento.data, hora);
  if (!deveEncerrarEvento(evento, lastReserva)) return false;
  await repo.updateEvento(evento.id, { status: 'inativo' });
  console.log(`[massagem-encerramento] evento ${evento.id} inativo`);
  return true;
}

async function processarEncerramentosEventos() {
  const eventos = await repo.listEventos({ all: false });
  for (const evento of eventos) {
    try {
      await encerrarEventoSeDevido(evento);
    } catch (err) {
      console.error('[massagem-encerramento]', evento.id, err.message);
    }
  }
}

function agendarLembretesMassagem(intervalMs = 60000) {
  console.log('[massagem-encerramento] job a cada 60s');
  const tick = () => {
    processarLembretes().catch((err) => console.error('[massagem-lembrete]', err.message));
    processarEncerramentosEventos().catch((err) =>
      console.error('[massagem-encerramento]', err.message)
    );
  };
  tick();
  return setInterval(tick, intervalMs);
}

module.exports = {
  processarLembretes,
  processarEncerramentosEventos,
  encerrarEventoSeDevido,
  agendarLembretesMassagem,
};
