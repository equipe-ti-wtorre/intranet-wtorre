import { Component, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AutofocusDirective, IconComponent } from './ui';
import { DialogDirective } from './dialog.directive';

// Exclusão que não tem volta: a pessoa digita o nome para liberar o botão.
@Component({
  selector: 'app-confirm-delete',
  standalone: true,
  imports: [FormsModule, AutofocusDirective, IconComponent, DialogDirective],
  template: `
    <div class="modal-scrim" (click)="!busy() && cancel.emit()">
      <div class="modal del-modal" (click)="$event.stopPropagation()" role="alertdialog" appDialog (dialogClose)="!busy() && cancel.emit()">
        <div class="modal-head row"><app-icon name="trash" [size]="16" /><h2>{{ title() }}</h2>
          <button type="button" class="btn btn-ghost btn-icon btn-sm modal-x" [disabled]="busy()" aria-label="Fechar" title="Fechar" (click)="cancel.emit()"><app-icon name="x" [size]="16" /></button>
        </div>
        <div class="modal-body">
          <p class="del-modal__text">{{ message() }}</p>
          <p class="del-modal__warn">Não dá para desfazer.</p>
          <div class="field">
            <label for="del-name">Para confirmar, digite <b>{{ name() }}</b></label>
            <input id="del-name" class="input" appAutofocus autocomplete="off" [ngModel]="typed()" (ngModelChange)="typed.set($event)"
                   (keydown.enter)="matches() && !busy() && confirm.emit()" [disabled]="busy()" />
          </div>
        </div>
        <div class="modal-foot">
          <button type="button" class="btn btn-ghost" [disabled]="busy()" (click)="cancel.emit()">Cancelar</button>
          <button type="button" class="btn btn-danger" [disabled]="!matches() || busy()" (click)="confirm.emit()">{{ busy() ? 'Excluindo…' : 'Excluir' }}</button>
        </div>
      </div>
    </div>
  `,
})
export class ConfirmDeleteComponent {
  title = input.required<string>();
  name = input.required<string>();
  message = input('');
  busy = input(false);
  confirm = output<void>();
  cancel = output<void>();
  typed = signal('');

  matches() { return norm(this.typed()) === norm(this.name()); }
}

function norm(s: string) { return (s || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR'); }
