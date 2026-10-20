import { Component, inject } from '@angular/core';
import { ToastService } from '../core/toast.service';

@Component({
  selector: 'app-toasts',
  standalone: true,
  template: `
    <div class="toasts" aria-live="polite">
      @for (t of toast.toasts(); track t.id) {
        <div class="toast" [class.error]="t.tone === 'error'">
          <span>{{ t.text }}</span>
          @if (t.undo) { <button (click)="t.undo!()">Desfazer</button> }
        </div>
      }
    </div>
  `,
})
export class ToastsComponent { toast = inject(ToastService); }
