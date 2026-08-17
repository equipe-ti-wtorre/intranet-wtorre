import { Component, input, output } from '@angular/core';
import { Documento } from '../../models/documento.model';
import { formatarData, formatarTamanho, iconeExtensao } from './documento.util';

@Component({
  selector: 'app-documento-list',
  standalone: true,
  templateUrl: './documento-list.component.html',
  styleUrl: './documento-list.component.scss',
})
export class DocumentoListComponent {
  readonly documentos = input.required<Documento[]>();

  readonly visualizar = output<Documento>();
  readonly baixar = output<Documento>();

  iconeExtensao = iconeExtensao;
  formatarTamanho = formatarTamanho;
  formatarData = formatarData;
}
