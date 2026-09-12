import { Injectable, signal } from '@angular/core';

export type ToastType = 'success' | 'error';

export interface ToastMessage {
  id: number;
  type: ToastType;
  text: string;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private nextId = 0;
  readonly toasts = signal<ToastMessage[]>([]);

  success(text: string): void {
    this.show('success', text);
  }

  error(text: string): void {
    this.show('error', text);
  }

  dismiss(id: number): void {
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }

  private show(type: ToastType, text: string): void {
    if (!text) return;
    const id = ++this.nextId;
    this.toasts.update((list) => [...list, { id, type, text }]);
    setTimeout(() => this.dismiss(id), 4500);
  }
}
