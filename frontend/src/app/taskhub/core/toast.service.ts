import { Injectable, signal } from '@angular/core';

export interface Toast { id: number; text: string; tone: 'info' | 'error'; ms: number; undo?: () => void; }

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<Toast[]>([]);
  private seq = 0;

  show(text: string, tone: Toast['tone'] = 'info', ms = 3500) {
    const t: Toast = { id: ++this.seq, text, tone, ms };
    this.toasts.update(l => [...l, t]);
    setTimeout(() => this.dismiss(t.id), ms);
  }

  error(text: string) { this.show(text, 'error', 6000); }

  // "Desfazer em vez de confirmar": a ação só é executada depois de 8 s,
  // a menos que a pessoa clique em Desfazer. Fechar o aviso confirma na hora.
  undoable(text: string, commit: () => void, onUndo: () => void, ms = 8000) {
    const id = ++this.seq;
    let settled = false;
    const t: Toast = { id, text, tone: 'info', ms, undo: () => { if (settled) return; settled = true; onUndo(); this.dismiss(id); } };
    this.toasts.update(l => [...l, t]);
    const finish = () => { if (settled) return; settled = true; this.dismiss(id); commit(); };
    this.commits.set(id, finish);
    setTimeout(finish, ms);
  }

  private commits = new Map<number, () => void>();

  dismiss(id: number) {
    const finish = this.commits.get(id);
    this.commits.delete(id);
    this.toasts.update(l => l.filter(t => t.id !== id));
    if (finish) finish();
  }
}
