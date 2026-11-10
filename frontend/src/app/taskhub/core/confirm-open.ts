import { map, Observable, of } from 'rxjs';
import { TaskDetail } from './models';

// Pergunta antes de concluir quando ainda há tarefa ou etapa aberta. Cancelar não grava.
export function confirmOpen(what: string, lines: string[]) {
  if (!lines.length) return true;
  const body = lines.map(line => `• ${line}`).join('\n');
  return confirm(`Ainda não foi concluído:\n\n${body}\n\nConcluir ${what} mesmo assim?`);
}

export function openWorkLines(tasks: { title: string; steps?: { title: string; done: boolean }[] }[]) {
  const lines: string[] = [];
  for (const task of tasks) {
    lines.push(task.title);
    for (const step of task.steps || []) if (!step.done) lines.push(`  ${step.title}`);
  }
  return lines;
}

export function askCloseTask(load: Observable<TaskDetail>, task: { status: { category: string }; subtasks_total?: number; subtasks_done?: number; subtasks?: { title: string; done: boolean }[] }) {
  if (task.status.category === 'done' || task.status.category === 'canceled') return of(true);
  if (task.subtasks) return of(confirmOpen('a tarefa', task.subtasks.filter(s => !s.done).map(s => s.title)));
  if ((task.subtasks_total || 0) <= (task.subtasks_done || 0)) return of(true);
  return load.pipe(map(detail => confirmOpen('a tarefa', (detail.subtasks || []).filter(s => !s.done).map(s => s.title))));
}
