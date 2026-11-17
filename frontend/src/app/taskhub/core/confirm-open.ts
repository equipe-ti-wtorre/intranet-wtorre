import { map, Observable, of, switchMap } from 'rxjs';
import { TaskDetail } from './models';
import { ConfirmService } from './confirm.service';

// Pergunta antes de concluir quando ainda há tarefa ou etapa aberta. Cancelar não grava.
export function confirmOpen(svc: ConfirmService, what: string, lines: string[]): Observable<boolean> {
  if (!lines.length) return of(true);
  return svc.confirm$({
    title: `Concluir ${what} mesmo assim?`,
    message: 'Ainda não foi concluído:',
    lines,
    confirmLabel: 'Concluir',
    icon: 'check',
  });
}

export function openWorkLines(tasks: { title: string; steps?: { title: string; done: boolean }[] }[]) {
  const lines: string[] = [];
  for (const task of tasks) {
    lines.push(task.title);
    for (const step of task.steps || []) if (!step.done) lines.push(`  ${step.title}`);
  }
  return lines;
}

export function askCloseTask(svc: ConfirmService, load: Observable<TaskDetail>, task: { status: { category: string }; subtasks_total?: number; subtasks_done?: number; subtasks?: { title: string; done: boolean }[] }): Observable<boolean> {
  if (task.status.category === 'done' || task.status.category === 'canceled') return of(true);
  if (task.subtasks) return confirmOpen(svc, 'a tarefa', task.subtasks.filter(s => !s.done).map(s => s.title));
  if ((task.subtasks_total || 0) <= (task.subtasks_done || 0)) return of(true);
  return load.pipe(switchMap(detail => confirmOpen(svc, 'a tarefa', (detail.subtasks || []).filter(s => !s.done).map(s => s.title))));
}
