import { DayData, Period, Task } from '../core/models';
import { fmtDate } from './slides';

// Apresentação do Meu Dia. Os slides são montados aqui num formato neutro (capa, números, colunas
// por período, tabela, duas listas) e desenhados igual na tela cheia e no PowerPoint.
export type DaySlideKey = 'capa' | 'resumo' | 'plano' | 'concluidas' | 'pendentes' | 'atencao' | 'esperando' | 'amanha';

export const DAY_SLIDES: { key: DaySlideKey; label: string; hint: string }[] = [
  { key: 'capa', label: 'Capa', hint: 'Seu nome, a data e o resumo do dia' },
  { key: 'resumo', label: 'Resumo do dia', hint: 'Itens feitos, atrasadas, vencem hoje e esperando você' },
  { key: 'plano', label: 'Plano por período', hint: 'Manhã, Tarde e Fim do dia, com o que foi feito' },
  { key: 'concluidas', label: 'Concluídas hoje', hint: 'Tarefas, rotina e lembretes feitos' },
  { key: 'pendentes', label: 'O que ficou', hint: 'O que ainda está aberto no plano' },
  { key: 'atencao', label: 'Atrasadas e bloqueios', hint: 'O que precisa de atenção' },
  { key: 'esperando', label: 'Esperando', hint: 'O que pediram a você e o que você pediu' },
  { key: 'amanha', label: 'Amanhã', hint: 'O que já está planejado e o que vence' },
];

export type Row = { cells: string[]; done?: boolean; tone?: 'late' | 'warn' | 'muted' };
export type DeckSlide =
  | { kind: 'cover'; key: string; title: string; subtitle: string; meta: string }
  | { kind: 'kpis'; key: string; title: string; items: { label: string; value: string; sub: string; tone?: 'late' | 'warn' }[]; note?: string }
  | { kind: 'periods'; key: string; title: string; columns: { title: string; sub: string; now: boolean; rows: Row[] }[] }
  | { kind: 'table'; key: string; title: string; head: string[]; rows: Row[]; empty: string }
  | { kind: 'lists'; key: string; title: string; lists: { title: string; tone: 'late' | 'warn' | 'brand' | 'muted'; rows: { main: string; sub: string }[]; empty: string }[] };

const PERIOD_LABEL: Record<Period, string> = { manha: 'Manhã', tarde: 'Tarde', fim: 'Fim do dia' };
const LOAD_LABEL = { leve: 'leve', equilibrado: 'equilibrada', cheio: 'cheia' } as const;
const closed = (t: Task) => t.status.category === 'done' || t.status.category === 'canceled';
const where = (t: Task) => (t.project ? `${t.project.name}${t.section ? ' › ' + t.section.name : ''}` : 'Individual');

export function buildDayDeck(d: DayData, keys: DaySlideKey[], person: string, title: string): DeckSlide[] {
  const date = new Date(`${d.date}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  const all = [
    ...d.plan.map(t => closed(t)),
    ...d.routine.map(r => r.done), ...d.reminders.map(r => r.done),
  ];
  const doneCount = all.filter(Boolean).length;
  const blocked = d.plan.filter(t => t.status.category === 'blocked');
  const out: DeckSlide[] = [];

  for (const key of DAY_SLIDES.map(s => s.key).filter(k => keys.includes(k))) {
    if (key === 'capa') {
      // O título já leva a data; o subtítulo traz quem apresenta (e a data só se o título foi trocado).
      const dateCap = date.charAt(0).toUpperCase() + date.slice(1);
      out.push({ kind: 'cover', key, title, subtitle: title.toLowerCase().includes(String(new Date(`${d.date}T12:00:00`).getDate())) ? person : `${person} · ${dateCap}`,
        meta: `${doneCount} de ${all.length} itens feitos · dia ${LOAD_LABEL[d.load]}` });
    }
    if (key === 'resumo') {
      out.push({ kind: 'kpis', key, title: 'Resumo do dia', items: [
        { label: 'Itens feitos', value: `${doneCount}/${all.length}`, sub: 'tarefas, rotina e lembretes' },
        { label: 'Atrasadas', value: `${d.counts.overdue}`, sub: d.counts.overdue ? 'fora do plano de hoje' : 'nenhuma', tone: d.counts.overdue ? 'late' : undefined },
        { label: 'Vencem hoje', value: `${d.counts.today}`, sub: d.counts.today ? 'precisam sair hoje' : 'nenhuma', tone: d.counts.today ? 'warn' : undefined },
        { label: 'Esperando você', value: `${d.counts.waiting_me}`, sub: d.counts.waiting_me ? 'etapas pedidas a você' : 'ninguém' },
      ], note: `Carga do dia: ${LOAD_LABEL[d.load]}.` });
    }
    if (key === 'plano') {
      out.push({ kind: 'periods', key, title: 'Plano por período', columns: d.periods.map(p => ({
        title: PERIOD_LABEL[p.key],
        sub: `${p.done} de ${p.total} · ${LOAD_LABEL[p.load]}`,
        now: d.current_period === p.key,
        rows: [
          ...d.routine.filter(r => r.period === p.key).map(r => ({ cells: [`Rotina · ${r.title}`], done: r.done })),
          ...d.plan.filter(t => t.period === p.key).map(t => ({ cells: [t.title], done: closed(t), tone: t.status.category === 'blocked' ? 'warn' as const : undefined })),
          ...d.reminders.filter(r => r.period === p.key).map(r => ({ cells: [`Lembrete · ${r.title}`], done: r.done })),
        ],
      })) });
    }
    if (key === 'concluidas') {
      const rows: Row[] = [
        ...d.plan.filter(closed).map(t => ({ cells: [t.title, 'Tarefa', where(t), PERIOD_LABEL[t.period]] })),
        ...d.routine.filter(r => r.done).map(r => ({ cells: [r.title, 'Rotina', '—', PERIOD_LABEL[r.period]] })),
        ...d.reminders.filter(r => r.done).map(r => ({ cells: [r.title, 'Lembrete', '—', PERIOD_LABEL[r.period]] })),
      ];
      out.push({ kind: 'table', key, title: 'Concluídas hoje', head: ['Item', 'Tipo', 'Onde', 'Período'], rows, empty: 'Nada concluído ainda.' });
    }
    if (key === 'pendentes') {
      const rows: Row[] = d.plan.filter(t => !closed(t)).map(t => ({
        cells: [t.title, PERIOD_LABEL[t.period], where(t), t.due_date ? fmtDate(t.due_date) : '—'],
        tone: t.due_date && t.due_date < d.date ? 'late' : t.status.category === 'blocked' ? 'warn' : undefined,
      }));
      out.push({ kind: 'table', key, title: 'O que ficou', head: ['Tarefa', 'Período', 'Onde', 'Prazo'], rows, empty: 'Tudo do plano foi feito.' });
    }
    if (key === 'atencao') {
      out.push({ kind: 'lists', key, title: 'Atrasadas e bloqueios', lists: [
        { title: `Atrasadas (${d.suggestions.overdue.length})`, tone: 'late', empty: 'Nenhuma atrasada.',
          rows: d.suggestions.overdue.slice(0, 7).map(t => ({ main: t.title, sub: `${where(t)} · venceu ${fmtDate(t.due_date)}` })) },
        { title: `Bloqueadas no plano (${blocked.length})`, tone: 'warn', empty: 'Nada bloqueado.',
          rows: blocked.slice(0, 7).map(t => ({ main: t.title, sub: t.blocked_reason || 'Sem motivo informado' })) },
      ] });
    }
    if (key === 'esperando') {
      out.push({ kind: 'lists', key, title: 'Esperando', lists: [
        { title: `Por você (${d.waiting.for_me.length})`, tone: 'brand', empty: 'Ninguém está esperando por você.',
          rows: d.waiting.for_me.slice(0, 7).map(w => ({ main: w.step, sub: `${w.from ? w.from + ' · ' : ''}${w.task}` })) },
        { title: `Por outros (${d.waiting.by_me.length})`, tone: 'muted', empty: 'Você não está esperando ninguém.',
          rows: d.waiting.by_me.slice(0, 7).map(w => ({ main: `${w.person}: ${w.step}`, sub: `${w.task}${w.days > 1 ? ' · há ' + w.days + ' dias' : ''}` })) },
      ] });
    }
    if (key === 'amanha') {
      out.push({ kind: 'kpis', key, title: 'Amanhã', items: [
        { label: 'Já planejadas', value: `${d.tomorrow.planned}`, sub: fmtDate(d.tomorrow.date) },
        { label: 'Vencem amanhã', value: `${d.tomorrow.due}`, sub: d.tomorrow.due ? 'lembre de planejar' : 'nada vence', tone: d.tomorrow.due ? 'warn' : undefined },
        { label: 'Ficam do plano de hoje', value: `${d.plan.filter(t => !closed(t)).length}`, sub: 'vão para a manhã ao encerrar o dia' },
      ] });
    }
  }
  return out;
}
