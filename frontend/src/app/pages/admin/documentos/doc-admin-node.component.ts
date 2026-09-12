import { Component, input, output } from '@angular/core';
import { CategoriaDocumento, ICONE_PADRAO } from '../../../models/documento.model';
import { DocCatIconeComponent } from '../../../shared/documentos/doc-cat-icone.component';

export interface DocAdminNodeAction {
  type: 'edit' | 'remove' | 'select';
  item: CategoriaDocumento;
}

@Component({
  selector: 'app-doc-admin-node',
  standalone: true,
  imports: [DocCatIconeComponent],
  templateUrl: './doc-admin-node.component.html',
  styleUrl: './doc-admin-node.component.scss',
})
export class DocAdminNodeComponent {
  readonly items = input.required<CategoriaDocumento[]>();
  readonly depth = input(0);
  readonly selecionadaId = input<number | null>(null);
  readonly parentIcon = input<string | null>(null);
  readonly action = output<DocAdminNodeAction>();

  iconFor(item: CategoriaDocumento): string {
    const icone = item.icone?.trim();
    if (icone) return icone.toLowerCase();
    if (this.depth() > 0 && this.parentIcon()) return this.parentIcon()!;
    return ICONE_PADRAO;
  }

  childParentIcon(item: CategoriaDocumento): string | null {
    return item.icone?.trim().toLowerCase() || this.parentIcon() || this.iconFor(item);
  }
}
