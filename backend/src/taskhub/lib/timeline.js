const { isoDate, addDays } = require('./dates');

// Linha do tempo em pistas por responsável: cada dono tem um cursor.
// Projetos de pessoas diferentes andam em paralelo; o mesmo dono continua em fila.
// A mesma regra existe em frontend/src/app/taskhub/core/timeline.ts.

const DEFAULT_DURATION = 5;
const NONE_LANE = '__none__';

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
  const n = Math.max(1, Number(days) || 1);
  let d = nextBusiness(start);
  for (let i = 1; i < n; i++) d = afterBusiness(d);
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
const clampPhaseDays = (n) => Math.min(365, Math.max(0, Math.round(Number(n) || 0)));

function estimateDuration(work) {
  const start = dayOf(work.start_date);
  const due = dayOf(work.due_date);
  if (start && due && due >= start) return clampDays(businessDaysBetween(start, due));
  if (work.duration_days) return work.duration_days;
  const created = dayOf(work.created_at);
  if (due && created) return clampDays(businessDaysBetween(created, due));
  return DEFAULT_DURATION;
}

function ownerIdsOf(w) {
  let raw = w?.owner_ids;
  if (!raw && w?.owners) {
    const o = typeof w.owners === 'string' ? JSON.parse(w.owners) : w.owners;
    raw = Array.isArray(o) ? o.map((x) => x.id) : [];
  }
  return [...new Set((raw || []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
}

function laneKeys(w) {
  const ids = ownerIdsOf(w);
  return ids.length ? ids.map(String) : [NONE_LANE];
}

function sharesOwner(a, b) {
  const sa = new Set((a || []).map(Number));
  return (b || []).some((id) => sa.has(Number(id)));
}

function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart <= bEnd && bStart <= aEnd;
}

function maxIso(dates, fallback) {
  let m = fallback;
  for (const d of dates) if (d && (!m || d > m)) m = d;
  return m;
}

function sumPhaseDays(phases) {
  return (phases || []).reduce((n, p) => n + clampPhaseDays(p.duration_days), 0);
}

/**
 * items: [{ duration_days, start_date?, completed_at?, owner_ids? }] na ordem da fila.
 * Cada responsável tem um cursor; o trabalho espera o mais tarde dos donos dele.
 */
function computeTimeline(items, projectStart, today = isoDate()) {
  const base = nextBusiness(dayOf(projectStart) || today);
  const cursors = new Map();
  const out = items.map((w) => {
    const keys = laneKeys(w);
    const ownerCursor = maxIso(keys.map((k) => cursors.get(k) || base), base);
    const planned = dayOf(w.start_date);
    const duration = Math.max(1, Number(w.duration_days) || DEFAULT_DURATION);
    const done = dayOf(w.completed_at);
    const started = !done && planned && planned <= today;
    let start;
    let end;
    let late = false;
    if (done) {
      end = done;
      if (planned && planned <= end) start = planned;
      else if (end < ownerCursor) start = startBefore(end, duration);
      else start = ownerCursor;
    } else if (started) {
      start = planned;
      end = endAfter(start, duration);
      if (end < today) {
        late = true;
        end = afterBusiness(today);
      }
    } else {
      start = planned && nextBusiness(planned) > ownerCursor ? nextBusiness(planned) : ownerCursor;
      end = endAfter(start, duration);
      if (end < today) {
        late = true;
        end = afterBusiness(today);
      }
    }
    const next = afterBusiness(end);
    for (const k of keys) {
      const cur = cursors.get(k) || base;
      if (next > cur) cursors.set(k, next);
    }
    return { start, end, late, duration };
  });
  const forecast = out.reduce((max, r) => (!max || r.end > max ? r.end : max), null);
  return { rows: out, forecast_end: forecast };
}

function firstFreeSlot(occupied, ownerIds, duration, from) {
  let start = nextBusiness(from);
  const days = Math.max(1, duration);
  for (let n = 0; n < 400; n++) {
    const end = endAfter(start, days);
    const hit = occupied.find((w) => sharesOwner(w.owner_ids, ownerIds) && rangesOverlap(start, end, w.start, w.end));
    if (!hit) return { start, due: end };
    start = afterBusiness(hit.end);
  }
  return { start, due: endAfter(start, days) };
}

function simulatePush(occupied, incoming, today) {
  const cursors = new Map();
  for (const id of incoming.owner_ids) cursors.set(String(id), afterBusiness(incoming.due));
  const updates = [];
  const ordered = [...occupied].sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : a.id - b.id));
  for (const w of ordered) {
    if (!sharesOwner(w.owner_ids, incoming.owner_ids)) continue;
    const keys = (w.owner_ids.length ? w.owner_ids : [NONE_LANE]).map(String);
    const ownerCursor = maxIso(keys.map((k) => cursors.get(k)), null);
    const inProgress = !!(w.start && w.start <= today);
    if (inProgress) {
      for (const k of keys) {
        const next = afterBusiness(w.end);
        const cur = cursors.get(k);
        if (!cur || next > cur) cursors.set(k, next);
      }
      continue;
    }
    if (!ownerCursor) continue;
    let start = w.start && nextBusiness(w.start) > ownerCursor ? nextBusiness(w.start) : ownerCursor;
    const end = endAfter(start, w.duration);
    if (start !== w.start || end !== w.end) updates.push({ id: w.id, start, end, duration: w.duration });
    const next = afterBusiness(end);
    for (const k of keys) {
      const cur = cursors.get(k);
      if (!cur || next > cur) cursors.set(k, next);
    }
  }
  return updates;
}

function scheduleImpact(works, incoming, projectStart, today = isoDate()) {
  const plan = computeTimeline(works, projectStart, today);
  const occupied = works.map((w, i) => ({
    id: w.id,
    name: w.name,
    owner_ids: ownerIdsOf(w),
    owners: Array.isArray(w.owners) ? w.owners : [],
    start: plan.rows[i].start,
    end: plan.rows[i].end,
    duration: plan.rows[i].duration,
    completed_at: w.completed_at,
    saved_start: dayOf(w.start_date),
  })).filter((w) => w.id !== incoming.exclude_id && !dayOf(w.completed_at));

  const start = nextBusiness(incoming.start);
  const duration = Math.max(1, incoming.duration_days || businessDaysBetween(start, incoming.due) || DEFAULT_DURATION);
  const due = incoming.due && incoming.due >= start ? incoming.due : endAfter(start, duration);
  const ownerIds = incoming.owner_ids || [];

  const pushed = simulatePush(occupied, { owner_ids: ownerIds, due }, today);
  const byId = new Map(pushed.map((u) => [u.id, u]));
  const conflicts = occupied.filter((w) => sharesOwner(w.owner_ids, ownerIds) && rangesOverlap(start, due, w.start, w.end));

  return {
    duration_days: duration,
    start,
    due,
    conflicts: conflicts.map((w) => {
      const next = byId.get(w.id);
      const names = (w.owners || []).filter((o) => ownerIds.includes(o.id)).map((o) => o.name);
      return {
        work_id: w.id,
        name: w.name,
        owner_ids: w.owner_ids,
        owner_names: names,
        start: w.start,
        end: w.end,
        new_start: next?.start || w.start,
        new_end: next?.end || w.end,
        in_progress: !!(w.saved_start && w.saved_start <= today),
      };
    }),
    updates: pushed,
    suggestion: firstFreeSlot(occupied, ownerIds, duration, start),
  };
}

module.exports = {
  DEFAULT_DURATION,
  computeTimeline,
  estimateDuration,
  businessDaysBetween,
  dayOf,
  endAfter,
  nextBusiness,
  afterBusiness,
  ownerIdsOf,
  sharesOwner,
  sumPhaseDays,
  clampPhaseDays,
  scheduleImpact,
};
