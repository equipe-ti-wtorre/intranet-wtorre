import { Component, input, output } from '@angular/core';
import { SafeResourceUrl } from '@angular/platform-browser';

@Component({
  selector: 'app-documento-preview-modal',
  standalone: true,
  templateUrl: './documento-preview-modal.component.html',
  styleUrl: './documento-preview-modal.component.scss',
})
export class DocumentoPreviewModalComponent {
  readonly aberto = input(false);
  readonly titulo = input('');
  readonly url = input<SafeResourceUrl | null>(null);
  readonly carregando = input(false);

  readonly fechar = output<void>();
}
