import { UpperCasePipe } from '@angular/common';
import { Component, Input } from '@angular/core';
import { DocCatIconeComponent } from '../../../shared/documentos/doc-cat-icone.component';
import { splitTituloCapa } from '../documento.util';

@Component({
  selector: 'app-documento-gencover',
  standalone: true,
  imports: [DocCatIconeComponent, UpperCasePipe],
  templateUrl: './documento-gencover.component.html',
  styleUrl: './documento-gencover.component.scss',
})
export class DocumentoGencoverComponent {
  @Input({ required: true }) titulo!: string;
  @Input({ required: true }) extensao!: string;
  @Input() iconeCategoria: string | null = null;
  @Input() kicker = 'GRUPO WTORRE';
  @Input() tags = '';
  @Input() variant: 'feature' | 'card' = 'card';
  @Input() thumbUrl: string | null = null;
  @Input() aguardandoThumb = false;

  tituloCapa() {
    return splitTituloCapa(this.titulo);
  }

  extLabel(): string {
    return this.extensao.toUpperCase();
  }
}
