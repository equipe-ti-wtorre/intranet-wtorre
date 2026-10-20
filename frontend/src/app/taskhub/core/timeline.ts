// Linha do tempo em fila: cada trabalho dura N dias úteis e começa na data planejada,
// empurrado para depois do fim do anterior quando este invade o início.
// A mesma regra existe em backend/src/taskhub/lib/timeline.js.

export const DEFAULT_DURATION = 5;

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

function endAfter(start: string, days: number) {
  let d = nextBusiness(start);
  for (let i = 1; i < Math.max(1, days); i++) d = afterBusiness(d);
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

/** Dias úteis de a até b, contando os dois (mínimo 1). */
export function businessSpan(a: string, b: string) {
  if (b < a) return 1;
  let n = 0;
  for (let d = a; d <= b; d = addDays(d, 1)) if (isBusiness(d)) n++;
  return Math.max(1, n);
}

export interface TimelineInput { duration_days: number; start_date?: string | null; completed_at?: string | null }
export interface TimelineRow { start: string; end: string; late: boolean; duration: number }

export function computeTimeline(items: TimelineInput[], projectStart: string | null, today = isoOf(new Date())) {
  let cursor = nextBusiness(dayOf(projectStart) || today);
  const rows: TimelineRow[] = items.map(w => {
    const planned = dayOf(w.start_date);
    let start = planned && nextBusiness(planned) > cursor ? nextBusiness(planned) : cursor;
    const duration = Math.max(1, Number(w.duration_days) || DEFAULT_DURATION);
    let end: string;
    let late = false;
    const done = dayOf(w.completed_at);
    if (done) {
      end = done;
      if (planned && planned <= end) start = planned;
      else if (end < start) start = startBefore(end, duration);
      const next = afterBusiness(end);
      if (next > cursor) cursor = next;
    } else {
      end = endAfter(start, duration);
      if (end < today) { late = true; end = afterBusiness(today); }
      cursor = afterBusiness(end);
    }
    return { start, end, late, duration };
  });
  const forecast = rows.reduce<string | null>((max, r) => (!max || r.end > max ? r.end : max), null);
  return { rows, forecast_end: forecast };
}
