import { Injectable, signal } from '@angular/core';
import { Observable, from } from 'rxjs';

export interface ConfirmOptions {
  title: string;
  message?: string;
  // Itens listados abaixo da mensagem; "  texto" (com dois espaços) vira subitem.
  lines?: string[];
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  icon?: string;
  // Caixa de opção extra, devolvida em `checked`.
  checkbox?: { label: string; hint?: string; checked?: boolean };
}

export interface ConfirmResult { ok: boolean; checked: boolean; }

interface Pending { opts: ConfirmOptions; resolve: (r: ConfirmResult) => void; }

// Confirmação no padrão do app, no lugar do confirm() do navegador.
// O app-confirm-host (no shell) desenha a janela; quem pergunta recebe uma Promise.
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  readonly pending = signal<Pending | null>(null);

  ask(opts: ConfirmOptions): Promise<ConfirmResult> {
    // Já tem uma aberta: responde "não" para a nova, sem empilhar.
    if (this.pending()) return Promise.resolve({ ok: false, checked: false });
    return new Promise(resolve => this.pending.set({ opts, resolve }));
  }

  // Atalho: só sim/não.
  confirm(opts: ConfirmOptions | string): Promise<boolean> {
    const o = typeof opts === 'string' ? { title: opts } : opts;
    return this.ask(o).then(r => r.ok);
  }

  confirm$(opts: ConfirmOptions | string): Observable<boolean> { return from(this.confirm(opts)); }

  answer(ok: boolean, checked = false) {
    const p = this.pending();
    if (!p) return;
    this.pending.set(null);
    p.resolve({ ok, checked });
  }
}
