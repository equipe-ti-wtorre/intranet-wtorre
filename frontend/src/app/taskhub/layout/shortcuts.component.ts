import { Component, inject } from '@angular/core';
import { UiService } from '../core/ui.service';

@Component({
  selector: 'app-shortcuts',
  standalone: true,
  template: `
    <div class="modal-scrim" (click)="ui.helpOpen.set(false)">
      <div class="modal" (click)="$event.stopPropagation()" role="dialog" aria-label="Atalhos de teclado">
        <div class="modal-head">Atalhos de teclado</div>
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
        <div class="modal-foot"><button class="btn" (click)="ui.helpOpen.set(false)">Fechar</button></div>
      </div>
    </div>
  `,
})
export class ShortcutsComponent { ui = inject(UiService); }
