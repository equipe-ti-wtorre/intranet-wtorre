import { Priority, StatusCategory, Task } from './models';

export function todayIso(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function addDaysIso(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return todayIso(new Date(y, m - 1, d + n));
}

export function parseIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

// "Hoje", "Amanhã", "Ontem", "sex", "12 out"
export function dueLabel(iso: string | null): string {
  if (!iso) return '';
  const today = todayIso();
  if (iso === today) return 'Hoje';
  if (iso === addDaysIso(today, 1)) return 'Amanhã';
  if (iso === addDaysIso(today, -1)) return 'Ontem';
  const d = parseIso(iso);
  const diff = Math.round((d.getTime() - parseIso(today).getTime()) / 864e5);
  if (diff > 1 && diff < 7) return WEEKDAYS[d.getDay()];
  const label = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return d.getFullYear() === new Date().getFullYear() ? label : `${label} ${d.getFullYear()}`;
}

export function dueTone(t: Pick<Task, 'due_date' | 'status'>): 'late' | 'today' | 'soon' | '' {
  if (!t.due_date || isClosed(t.status.category)) return '';
  const today = todayIso();
  if (t.due_date < today) return 'late';
  if (t.due_date === today) return 'today';
  if (t.due_date <= addDaysIso(today, 2)) return 'soon';
  return '';
}

export const isClosed = (c: StatusCategory) => c === 'done' || c === 'canceled';

export function minutesLabel(min: number | null | undefined): string {
  if (min == null) return '';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60); const m = min % 60;
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}

export const PRIORITIES: { value: Priority; label: string }[] = [
  { value: 'critica', label: 'Crítica' },
  { value: 'alta', label: 'Alta' },
  { value: 'media', label: 'Média' },
  { value: 'baixa', label: 'Baixa' },
];
export const priorityLabel = (p: Priority) => PRIORITIES.find(x => x.value === p)?.label || 'Média';
export const PRIORITY_RANK: Record<Priority, number> = { critica: 0, alta: 1, media: 2, baixa: 3 };

export const CATEGORY_LABEL: Record<StatusCategory, string> = {
  todo: 'A fazer', doing: 'Em andamento', blocked: 'Bloqueado', done: 'Concluído', canceled: 'Cancelado',
};

export function longDate(iso: string): string {
  return parseIso(iso).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
}

export function relativeTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'agora';
  if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `há ${Math.floor(diff / 3600)} h`;
  if (diff < 7 * 86400) return `há ${Math.floor(diff / 86400)} d`;
  return new Date(iso).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' });
}
