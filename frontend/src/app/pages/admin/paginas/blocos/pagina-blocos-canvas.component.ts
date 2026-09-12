import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { Component, input, output } from '@angular/core';
import { PaginaBloco, TipoBloco, BlocoTextoConfig, BlocoImagemConfig, BlocoCarrosselConfig, BlocoBotaoConfig } from '../../../../models/pagina.model';

const TIPO_LABELS: Record<TipoBloco, string> = {
  texto: 'Texto',
  imagem: 'Imagem',
  carrossel: 'Carrossel',
  botao: 'Botão',
};

@Component({
  selector: 'app-pagina-blocos-canvas',
  standalone: true,
  imports: [DragDropModule],
  templateUrl: './pagina-blocos-canvas.component.html',
  styleUrl: './pagina-blocos-canvas.component.scss',
})
export class PaginaBlocosCanvasComponent {
  readonly blocos = input.required<PaginaBloco[]>();
  readonly selecionadoId = input<string | null>(null);

  readonly blocosChange = output<PaginaBloco[]>();
  readonly selecionar = output<string>();
  readonly remover = output<string>();
  readonly duplicar = output<string>();

  labelTipo(tipo: TipoBloco): string {
    return TIPO_LABELS[tipo] || tipo;
  }

  previewBloco(bloco: PaginaBloco): string {
    switch (bloco.tipo) {
      case 'texto': {
        const c = bloco.config as BlocoTextoConfig;
        return c.titulo || 'Texto rico';
      }
      case 'imagem': {
        const c = bloco.config as BlocoImagemConfig;
        return c.alt || c.url || 'Imagem';
      }
      case 'carrossel': {
        const c = bloco.config as BlocoCarrosselConfig;
        return `${c.slides?.length || 0} slide(s)`;
      }
      case 'botao': {
        const c = bloco.config as BlocoBotaoConfig;
        return c.label || 'Botão';
      }
      default:
        return '';
    }
  }

  onDrop(event: CdkDragDrop<PaginaBloco[]>): void {
    const list = [...this.blocos()];
    moveItemInArray(list, event.previousIndex, event.currentIndex);
    const reordered = list.map((b, i) => ({ ...b, ordem: i }));
    this.blocosChange.emit(reordered);
  }

  mover(idx: number, dir: -1 | 1): void {
    const list = [...this.blocos()];
    const target = idx + dir;
    if (target < 0 || target >= list.length) return;
    moveItemInArray(list, idx, target);
    this.blocosChange.emit(list.map((b, i) => ({ ...b, ordem: i })));
  }
}
