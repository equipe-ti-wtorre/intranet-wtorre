import { Component, inject } from '@angular/core';
import { ToastService } from './toast.service';

@Component({
  selector: 'app-toast',
  standalone: true,
  template: `
    <div class="toast" [class.show]="toastService.toasts().length > 0" aria-live="polite">
      @if (toastService.toasts().length) {
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M5 13l4 4L19 7"
            stroke="currentColor"
            stroke-width="2.4"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        <span>{{ toastService.toasts()[toastService.toasts().length - 1].text }}</span>
      }
    </div>
  `,
  styles: `
    .toast {
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%) translateY(80px);
      background: var(--ink, #10151f);
      color: #fff;
      padding: 13px 22px;
      border-radius: 12px;
      font-size: 13.5px;
      font-weight: 600;
      z-index: 70;
      opacity: 0;
      transition: 0.3s;
      display: flex;
      align-items: center;
      gap: 10px;
      max-width: min(420px, calc(100vw - 32px));
    }
    .toast.show {
      transform: translateX(-50%) translateY(0);
      opacity: 1;
    }
    .toast svg {
      width: 17px;
      height: 17px;
      color: #5fe0a0;
      flex-shrink: 0;
    }
  `,
})
export class ToastComponent {
  readonly toastService = inject(ToastService);
}
