import { Task, TeamDashboard } from '../core/models';
import { DeckSlide } from './day-deck';
import { fmtDate } from './slides';

export type TeamSlideKey = 'capa' | 'resumo' | 'equipes' | 'pessoas' | 'atrasadas' | 'bloqueadas' | 'prazos' | 'triagem' | 'aguardando';

export const TEAM_SLIDES: { key: TeamSlideKey; label: string; hint: string }[] = [
  { key: 'capa', label: 'Capa', hint: 'Nome do setor ou da equipe e a data' },
  { key: 'resumo', label: 'Resumo', hint: 'Abertas, andamento, atrasadas, pontualidade' },
  { key: 'equipes', label: 'Equipes', hint: 'Equipes do setor, com abertas e atrasadas' },
  { key: 'pessoas', label: 'Pessoas', hint: 'Abertas, atrasadas e carga de cada um' },
  { key: 'atrasadas', label: 'Atrasadas', hint: 'Passaram do prazo e continuam abertas' },
  { key: 'bloqueadas', label: 'Bloqueadas', hint: 'O que precisa ser destravado' },
  { key: 'prazos', label: 'Prazos da semana', hint: 'O que vence nos próximos 7 dias' },
  { key: 'triagem', label: 'Para triagem', hint: 'Abertas sem prazo' },
  { key: 'aguardando', label: 'Aguardando outros', hint: 'Dependem de gente de fora' },
];

const who = (t: Task) => t.assignee?.name || 'sem responsável';
const where = (t: Task) => (t.project ? `${t.project.name}${t.section ? ' › ' + t.section.name : ''}` : 'Corporativo');
const row = (t: Task, extra?: string): { main: string; sub: string } => ({
  main: t.title,
  sub: [who(t), where(t), extra].filter(Boolean).join(' · '),
});

export function defaultTeamSlides(d: TeamDashboard, sector: boolean): TeamSlideKey[] {
  return TEAM_SLIDES.map(s => s.key).filter(k => {
    if (k === 'equipes') return sector && !!d.teams?.length;
    if (k === 'pessoas') return d.people.length > 0;
    if (k === 'atrasadas') return d.overdue.length > 0;
    if (k === 'bloqueadas') return d.blocked.length > 0;
    if (k === 'prazos') return d.due_soon.length > 0;
    if (k === 'triagem') return d.triage.length > 0;
    if (k === 'aguardando') return d.waiting_other.length > 0;
    return true;
  });
}

export function buildTeamDeck(d: TeamDashboard, keys: TeamSlideKey[], kindLabel: string, title: string): DeckSlide[] {
  const date = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  const k = d.kpis;
  const totalDue = Number(k.done_with_due_30d) || 0;
  const onTime = totalDue ? `${Math.round((Number(k.on_time_30d) / totalDue) * 100)}%` : '—';
  const out: DeckSlide[] = [];

  const add = (key: TeamSlideKey, slide: DeckSlide) => { if (keys.includes(key)) out.push(slide); };

  add('capa', {
    kind: 'cover', key: 'capa', title,
    subtitle: `${kindLabel} · ${d.people.length} ${d.people.length === 1 ? 'pessoa' : 'pessoas'}`,
    meta: date,
  });

  add('resumo', {
    kind: 'kpis', key: 'resumo', title: 'Resumo',
    items: [
      { label: 'Abertas', value: `${k.open}`, sub: `${k.created_week} criadas nesta semana` },
      { label: 'Em andamento', value: `${k.doing}`, sub: 'sendo feitas agora' },
      { label: 'Atrasadas', value: `${k.overdue}`, sub: k.overdue ? 'passaram do prazo' : 'tudo em dia', tone: k.overdue ? 'late' : undefined },
      { label: 'Bloqueadas', value: `${k.blocked}`, sub: k.blocked ? 'precisam de ajuda' : 'nada travado', tone: k.blocked ? 'warn' : undefined },
      { label: 'Concluídas na semana', value: `${k.done_week}`, sub: `semana passada: ${k.done_prev_week}` },
      { label: 'Pontualidade', value: onTime, sub: 'entregas com prazo em 30 dias' },
    ],
  });

  add('equipes', {
    kind: 'table', key: 'equipes', title: 'Equipes',
    head: ['Equipe', 'Pessoas', 'Abertas', 'Atrasadas'],
    rows: (d.teams || []).map(t => ({
      cells: [t.name, `${t.members_count}`, `${t.open}`, `${t.overdue}`],
      tone: t.overdue ? 'late' : undefined,
    })),
    empty: 'Nenhuma equipe neste setor.',
  });

  add('pessoas', {
    kind: 'table', key: 'pessoas', title: 'Pessoas',
    head: ['Pessoa', 'Abertas', 'Atrasadas', 'Carga'],
    rows: d.people.map(p => ({
      cells: [p.name, `${p.open}`, `${p.overdue}`, `${p.load_pct}%`],
      tone: p.overdue ? 'late' : p.load_pct > 100 ? 'warn' : undefined,
    })),
    empty: 'Ninguém neste painel.',
  });

  add('atrasadas', {
    kind: 'lists', key: 'atrasadas', title: 'Atrasadas',
    lists: [{ title: `Atrasadas (${d.overdue.length})`, tone: 'late', empty: 'Nenhuma atrasada.',
      rows: d.overdue.slice(0, 10).map(t => row(t, t.due_date ? `venceu ${fmtDate(t.due_date)}` : undefined)) }],
  });

  add('bloqueadas', {
    kind: 'lists', key: 'bloqueadas', title: 'Bloqueadas',
    lists: [{ title: `Bloqueadas (${d.blocked.length})`, tone: 'warn', empty: 'Nada bloqueado.',
      rows: d.blocked.slice(0, 10).map(t => row(t, t.blocked_reason || undefined)) }],
  });

  add('prazos', {
    kind: 'lists', key: 'prazos', title: 'Prazos da semana',
    lists: [{ title: `Vencem em 7 dias (${d.due_soon.length})`, tone: 'brand', empty: 'Sem prazos na semana.',
      rows: d.due_soon.slice(0, 10).map(t => row(t, t.due_date ? fmtDate(t.due_date) : undefined)) }],
  });

  add('triagem', {
    kind: 'lists', key: 'triagem', title: 'Para triagem',
    lists: [{ title: `Sem prazo (${d.triage.length})`, tone: 'muted', empty: 'Tudo com prazo.',
      rows: d.triage.slice(0, 10).map(t => row(t)) }],
  });

  add('aguardando', {
    kind: 'lists', key: 'aguardando', title: 'Aguardando outros',
    lists: [{ title: `Dependem de fora (${d.waiting_other.length})`, tone: 'warn', empty: 'Nada aguardando outros setores.',
      rows: d.waiting_other.slice(0, 10).map(t => row(t, t.waiting_on.map(w => w.name).join(', '))) }],
  });

  return out;
}
