import { WorkDashboard } from '../core/models';

// Slides disponíveis para apresentar um trabalho. A mesma lista serve para a apresentação
// dentro do sistema e para o PowerPoint; a pessoa escolhe quais entram.
export type SlideKey = 'capa' | 'resumo' | 'andamento' | 'status' | 'evolucao' | 'prazos' | 'atencao' | 'equipe' | 'entregas';

export const SLIDES: { key: SlideKey; label: string; hint: string }[] = [
  { key: 'capa', label: 'Capa', hint: 'Projeto, equipe, responsável e data' },
  { key: 'resumo', label: 'Resumo', hint: 'Progresso, tempo até o prazo e números principais' },
  { key: 'andamento', label: 'Em andamento', hint: 'O que está sendo feito agora' },
  { key: 'status', label: 'Situação das tarefas', hint: 'Quantas tarefas em cada status' },
  { key: 'evolucao', label: 'Evolução semanal', hint: 'Criadas × concluídas nas últimas 8 semanas' },
  { key: 'prazos', label: 'Próximos prazos', hint: 'O que vence nos próximos 14 dias' },
  { key: 'atencao', label: 'Atrasadas e bloqueios', hint: 'O que precisa de atenção, com os motivos' },
  { key: 'equipe', label: 'Equipe', hint: 'Tarefas abertas, atrasadas e concluídas por pessoa' },
  { key: 'entregas', label: 'Concluídas na semana', hint: 'O que foi entregue nos últimos 7 dias' },
];

export const HEALTH_LABEL = { no_prazo: 'No prazo', em_risco: 'Em risco', atrasado: 'Atrasado', concluido: 'Concluído' } as const;

export function linkPhrase(p: { continues?: string[]; continued_by?: string[] }) {
  return [
    p.continues?.length ? `Continua de ${p.continues.join(', ')}` : null,
    p.continued_by?.length ? `Nova versão: ${p.continued_by.join(', ')}` : null,
  ].filter(Boolean).join('  ·  ');
}

export function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}
export function weekLabel(iso: string) { const [, m, d] = iso.split('-'); return `${d}/${m}`; }

// Começa com todos os slides; "Equipe" só quando há mais de uma pessoa.
export function defaultSelection(d: WorkDashboard): SlideKey[] {
  return SLIDES.map(s => s.key).filter(k => k !== 'equipe' || d.by_person.length > 1);
}
