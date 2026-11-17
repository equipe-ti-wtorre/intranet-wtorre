import { Component, inject } from '@angular/core';
import { ToastService } from '../core/toast.service';
import { IconComponent } from '../shared/ui';

@Component({
  selector: 'app-toasts',
  standalone: true,
  imports: [IconComponent],
  template: `
    <div class="toasts">
      @for (t of toast.toasts(); track t.id) {
        <div class="toast" [class.error]="t.tone === 'error'" [attr.role]="t.tone === 'error' ? 'alert' : 'status'" [attr.aria-live]="t.tone === 'error' ? 'assertive' : 'polite'">
          <span>{{ t.text }}</span>
          @if (t.undo) { <button type="button" class="toast__undo" (click)="t.undo!()">Desfazer</button> }
          <button type="button" class="toast__x" aria-label="Fechar aviso" (click)="toast.dismiss(t.id)"><app-icon name="x" [size]="14" /></button>
          @if (t.undo) { <i class="toast__bar" [style.--toast-ms]="t.ms + 'ms'" aria-hidden="true"></i> }
        </div>
      }
    </div>
  `,
})
export class ToastsComponent { toast = inject(ToastService); }
