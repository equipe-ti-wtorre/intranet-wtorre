import { Component, inject } from '@angular/core';
import { UiService } from '../core/ui.service';
import { IconComponent } from '../shared/ui';
import { DialogDirective } from '../shared/dialog.directive';

@Component({
  selector: 'app-shortcuts',
  standalone: true,
  imports: [IconComponent, DialogDirective],
  template: `
    <div class="modal-scrim" (click)="ui.helpOpen.set(false)">
      <div class="modal" (click)="$event.stopPropagation()" appDialog (dialogClose)="ui.helpOpen.set(false)">
        <div class="modal-head">
          <h2>Atalhos de teclado</h2>
          <button type="button" class="btn btn-ghost btn-icon btn-sm modal-x" aria-label="Fechar" title="Fechar" (click)="ui.helpOpen.set(false)"><app-icon name="x" [size]="16" /></button>
        </div>
        <div class="modal-body shortcuts">
          <span><kbd>Ctrl</kbd> <kbd>K</kbd></span><span>Buscar e comandos</span>
          <span><kbd>Q</kbd></span><span>Nova tarefa (no projeto aberto, nasce nele)</span>
          <span><kbd>G</kbd> <kbd>H</kbd></span><span>Ir para o Meu Dia</span>
          <span><kbd>G</kbd> <kbd>I</kbd></span><span>Ir para a Caixa de entrada</span>
          <span><kbd>G</kbd> <kbd>M</kbd></span><span>Minhas tarefas</span>
          <span><kbd>G</kbd> <kbd>A</kbd></span><span>Atribuídas por mim</span>
          <span><kbd>G</kbd> <kbd>E</kbd></span><span>Equipes</span>
          <span><kbd>G</kbd> <kbd>N</kbd></span><span>Notas</span>
          <span><kbd>G</kbd> <kbd>L</kbd></span><span>Lembretes</span>
          <span><kbd>Esc</kbd></span><span>Fechar painel ou janela</span>
          <span><kbd>?</kbd></span><span>Mostrar esta lista</span>
        </div>
        <div class="modal-foot"><button type="button" class="btn" (click)="ui.helpOpen.set(false)">Fechar</button></div>
      </div>
    </div>
  `,
})
export class ShortcutsComponent { ui = inject(UiService); }
