const { isoDate, addDays } = require('./dates');

// Linha do tempo em fila: cada trabalho dura N dias úteis e começa na data planejada,
// empurrado para depois do fim do anterior quando este invade o início.
// A mesma regra existe em frontend/src/app/taskhub/core/timeline.ts.

const DEFAULT_DURATION = 5;

const dayOf = (v) => {
  if (!v) return null;
  if (v instanceof Date) return isoDate(v);
  const s = String(v);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : isoDate(new Date(s));
};

function isBusiness(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  return dow !== 0 && dow !== 6;
}

function nextBusiness(iso) {
  let d = iso;
  while (!isBusiness(d)) d = addDays(d, 1);
  return d;
}

const afterBusiness = (iso) => nextBusiness(addDays(iso, 1));

function endAfter(start, days) {
  let d = nextBusiness(start);
  for (let i = 1; i < Math.max(1, days); i++) d = afterBusiness(d);
  return d;
}

function startBefore(end, days) {
  let d = end;
  for (let i = 1; i < Math.max(1, days); i++) {
    d = addDays(d, -1);
    while (!isBusiness(d)) d = addDays(d, -1);
  }
  return d;
}

function businessDaysBetween(from, to) {
  if (to < from) return 0;
  let n = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) if (isBusiness(d)) n++;
  return n;
}

const clampDays = (n) => Math.min(365, Math.max(1, n));

function estimateDuration(work) {
  const start = dayOf(work.start_date);
  const due = dayOf(work.due_date);
  if (start && due && due >= start) return clampDays(businessDaysBetween(start, due));
  if (work.duration_days) return work.duration_days;
  const created = dayOf(work.created_at);
  if (due && created) return clampDays(businessDaysBetween(created, due));
  return DEFAULT_DURATION;
}

/**
 * items: [{ duration_days, start_date?, completed_at? }] na ordem da fila.
 * Cada trabalho começa na data planejada dele, ou depois do fim do anterior se este invadir o início.
 */
function computeTimeline(items, projectStart, today = isoDate()) {
  let cursor = nextBusiness(dayOf(projectStart) || today);
  const out = items.map((w) => {
    const planned = dayOf(w.start_date);
    let start = planned && nextBusiness(planned) > cursor ? nextBusiness(planned) : cursor;
    const duration = Math.max(1, Number(w.duration_days) || DEFAULT_DURATION);
    let end;
    let late = false;
    const done = dayOf(w.completed_at);
    if (done) {
      end = done;
      if (planned && planned <= end) start = planned;
      else if (end < start) start = startBefore(end, duration);
      const next = afterBusiness(end);
      cursor = next > cursor ? next : cursor;
    } else {
      end = endAfter(start, duration);
      if (end < today) {
        late = true;
        end = afterBusiness(today);
      }
      cursor = afterBusiness(end);
    }
    return { start, end, late, duration };
  });
  const forecast = out.reduce((max, r) => (!max || r.end > max ? r.end : max), null);
  return { rows: out, forecast_end: forecast };
}

module.exports = { DEFAULT_DURATION, computeTimeline, estimateDuration, businessDaysBetween, dayOf };
