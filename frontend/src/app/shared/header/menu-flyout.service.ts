import { Injectable } from '@angular/core';

/** Garante um único flyout aberto por nível de profundidade no menu desktop. */
@Injectable({ providedIn: 'root' })
export class MenuFlyoutService {
  private readonly openByDepth = new Map<number, () => void>();

  activate(depth: number, close: () => void): void {
    const prev = this.openByDepth.get(depth);
    if (prev && prev !== close) prev();
    this.openByDepth.set(depth, close);
  }

  deactivate(depth: number, close: () => void): void {
    if (this.openByDepth.get(depth) === close) {
      this.openByDepth.delete(depth);
    }
    for (const [d] of [...this.openByDepth.entries()]) {
      if (d > depth) this.openByDepth.delete(d);
    }
  }

  closeFromDepth(depth: number): void {
    for (const [d, close] of [...this.openByDepth.entries()]) {
      if (d >= depth) {
        close();
        this.openByDepth.delete(d);
      }
    }
  }
}
