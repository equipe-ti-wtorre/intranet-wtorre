// Linha do tempo em pistas por responsável: cada dono tem um cursor.
// Projetos de pessoas diferentes andam em paralelo; o mesmo dono continua em fila.
// A mesma regra existe em backend/src/taskhub/lib/timeline.js.

export const DEFAULT_DURATION = 5;
const NONE_LANE = '__none__';

const pad = (n: number) => String(n).padStart(2, '0');
export const isoOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseIso = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (iso: string, n: number) => { const d = parseIso(iso); d.setDate(d.getDate() + n); return isoOf(d); };

export function dayOf(v: string | null | undefined): string | null {
  if (!v) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : isoOf(new Date(v));
}

export const isBusiness = (iso: string) => { const dow = parseIso(iso).getDay(); return dow !== 0 && dow !== 6; };
export function nextBusiness(iso: string) { let d = iso; while (!isBusiness(d)) d = addDays(d, 1); return d; }
const afterBusiness = (iso: string) => nextBusiness(addDays(iso, 1));

export function endAfter(start: string, days: number) {
  const n = Math.max(1, Number(days) || 1);
  let d = nextBusiness(start);
  for (let i = 1; i < n; i++) d = afterBusiness(d);
  return d;
}
function startBefore(end: string, days: number) {
  let d = end;
  for (let i = 1; i < Math.max(1, days); i++) { d = addDays(d, -1); while (!isBusiness(d)) d = addDays(d, -1); }
  return d;
}

/** Dias úteis de a até b (positivo se b é depois de a). */
export function businessDiff(a: string, b: string) {
  if (a === b) return 0;
  const sign = b > a ? 1 : -1;
  const [from, to] = sign > 0 ? [a, b] : [b, a];
  let n = 0;
  for (let d = addDays(from, 1); d <= to; d = addDays(d, 1)) if (isBusiness(d)) n++;
  return n * sign;
}

/** Dias úteis de a até b, inclusive. Zero se b for antes de a. */
export function businessDays(a: string, b: string) {
  if (b < a) return 0;
  let n = 0;
  for (let d = a; d <= b; d = addDays(d, 1)) if (isBusiness(d)) n++;
  return n;
}

/** Dias úteis de a até b, contando os dois (mínimo 1). */
export function businessSpan(a: string, b: string) {
  return Math.max(1, businessDays(a, b));
}

export function sumPhaseDays(phases: { duration_days?: number | null }[]) {
  return phases.reduce((n, p) => n + Math.min(365, Math.max(0, Math.round(Number(p.duration_days) || 0))), 0);
}

export interface TimelineInput {
  duration_days: number;
  start_date?: string | null;
  completed_at?: string | null;
  owner_ids?: number[];
}
export interface TimelineRow { start: string; end: string; late: boolean; duration: number }

function ownerIdsOf(w: TimelineInput) {
  return [...new Set((w.owner_ids || []).map(Number).filter(n => Number.isInteger(n) && n > 0))];
}
function laneKeys(w: TimelineInput) {
  const ids = ownerIdsOf(w);
  return ids.length ? ids.map(String) : [NONE_LANE];
}
function maxIso(dates: (string | undefined)[], fallback: string) {
  let m = fallback;
  for (const d of dates) if (d && d > m) m = d;
  return m;
}

export function computeTimeline(items: TimelineInput[], projectStart: string | null, today = isoOf(new Date())) {
  const base = nextBusiness(dayOf(projectStart) || today);
  const cursors = new Map<string, string>();
  const rows: TimelineRow[] = items.map(w => {
    const keys = laneKeys(w);
    const ownerCursor = maxIso(keys.map(k => cursors.get(k) || base), base);
    const planned = dayOf(w.start_date);
    const duration = Math.max(1, Number(w.duration_days) || DEFAULT_DURATION);
    const done = dayOf(w.completed_at);
    const started = !done && !!planned && planned <= today;
    let start: string;
    let end: string;
    let late = false;
    if (done) {
      end = done;
      if (planned && planned <= end) start = planned;
      else if (end < ownerCursor) start = startBefore(end, duration);
      else start = ownerCursor;
    } else if (started && planned) {
      start = planned;
      end = endAfter(start, duration);
      if (end < today) { late = true; end = afterBusiness(today); }
    } else {
      start = planned && nextBusiness(planned) > ownerCursor ? nextBusiness(planned) : ownerCursor;
      end = endAfter(start, duration);
      if (end < today) { late = true; end = afterBusiness(today); }
    }
    const next = afterBusiness(end);
    for (const k of keys) {
      const cur = cursors.get(k) || base;
      if (next > cur) cursors.set(k, next);
    }
    return { start, end, late, duration };
  });
  const forecast = rows.reduce<string | null>((max, r) => (!max || r.end > max ? r.end : max), null);
  return { rows, forecast_end: forecast };
}
