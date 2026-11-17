import { Component, computed, inject, signal, effect } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConfirmService } from '../core/confirm.service';
import { DialogDirective } from './dialog.directive';
import { IconComponent } from './ui';

// Janela de confirmação única do app. Fica no shell; quem pergunta usa ConfirmService.
@Component({
  selector: 'app-confirm-host',
  standalone: true,
  imports: [FormsModule, DialogDirective, IconComponent],
  template: `
    @if (svc.pending(); as p) {
      <div class="modal-scrim" (click)="svc.answer(false)">
        <div class="modal confirm-modal" (click)="$event.stopPropagation()" appDialog (dialogClose)="svc.answer(false)" [attr.role]="p.opts.danger ? 'alertdialog' : 'dialog'">
          <div class="modal-head" [class.modal-head--danger]="p.opts.danger">
            @if (p.opts.icon || p.opts.danger) { <app-icon [name]="p.opts.icon || 'trash'" [size]="16" /> }
            <h2>{{ p.opts.title }}</h2>
          </div>
          <div class="modal-body">
            @if (p.opts.message) { <p class="confirm-modal__text">{{ p.opts.message }}</p> }
            @if (lines().length) {
              <ul class="confirm-modal__list">
                @for (l of lines(); track $index) { <li [class.sub]="l.sub">{{ l.text }}</li> }
              </ul>
            }
            @if (p.opts.checkbox; as c) {
              <label class="check-label check-label--top confirm-modal__check">
                <input type="checkbox" [ngModel]="checked()" (ngModelChange)="checked.set($event)" />
                <span>{{ c.label }}@if (c.hint) { <span class="hint confirm-modal__hint">{{ c.hint }}</span> }</span>
              </label>
            }
          </div>
          <div class="modal-foot">
            <button type="button" class="btn btn-ghost" (click)="svc.answer(false)">{{ p.opts.cancelLabel || 'Cancelar' }}</button>
            <button type="button" class="btn" [class.btn-danger]="p.opts.danger" [class.btn-primary]="!p.opts.danger" (click)="svc.answer(true, checked())">{{ p.opts.confirmLabel || 'Confirmar' }}</button>
          </div>
        </div>
      </div>
    }
  `,
})
export class ConfirmHostComponent {
  svc = inject(ConfirmService);
  checked = signal(false);
  lines = computed(() => (this.svc.pending()?.opts.lines || []).map(t => ({ text: t.trim(), sub: t.startsWith('  ') })));
  constructor() {
    effect(() => { const p = this.svc.pending(); this.checked.set(!!p?.opts.checkbox?.checked); });
  }
}
