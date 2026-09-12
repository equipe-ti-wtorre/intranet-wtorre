import {
  Component,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  inject,
  output,
  signal,
} from '@angular/core';
import { Documento } from '../../../models/documento.model';
import { DocumentosService } from '../../../services/documentos.service';
import {
  chipExtClass,
  chipSetorClass,
  formatarData,
  formatarTamanho,
} from '../documento.util';
import { DocumentoGencoverComponent } from '../documento-gencover/documento-gencover.component';
import { TextTooltipDirective } from '../../../shared/directives/text-tooltip.directive';

@Component({
  selector: 'app-documento-grid-card',
  standalone: true,
  imports: [DocumentoGencoverComponent, TextTooltipDirective],
  templateUrl: './documento-grid-card.component.html',
  styleUrl: './documento-grid-card.component.scss',
})
export class DocumentoGridCardComponent implements OnChanges, OnDestroy {
  private readonly documentosService = inject(DocumentosService);

  @Input({ required: true }) documento!: Documento;
  @Input() iconeCategoria: string | null = null;
  @Input() kicker = 'GRUPO WTORRE';

  readonly visualizar = output<void>();
  readonly baixar = output<void>();

  readonly thumbUrl = signal<string | null>(null);
  readonly thumbFalhou = signal(false);
  readonly thumbCarregando = signal(false);

  private objectUrl: string | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['documento']) {
      this.carregarThumb();
    }
  }

  ngOnDestroy(): void {
    this.revogarObjectUrl();
  }

  private carregarThumb(): void {
    this.revogarObjectUrl();
    this.thumbUrl.set(null);
    this.thumbFalhou.set(false);
    this.thumbCarregando.set(false);

    const doc = this.documento;
    if (!doc?.tem_thumb && !doc?.thumbnail_url) return;

    this.thumbCarregando.set(true);
    this.documentosService.carregarThumbnailPorId(doc.id).subscribe({
      next: (blob) => {
        if (!blob) {
          this.thumbFalhou.set(true);
          this.thumbCarregando.set(false);
          return;
        }
        this.objectUrl = URL.createObjectURL(blob);
        this.thumbUrl.set(this.objectUrl);
        this.thumbCarregando.set(false);
      },
      error: () => {
        this.thumbFalhou.set(true);
        this.thumbCarregando.set(false);
      },
    });
  }

  capaUrl(): string | null {
    if (this.thumbFalhou()) return null;
    return this.thumbUrl();
  }

  private revogarObjectUrl(): void {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }

  extLabel(): string {
    return this.documento.extensao.toUpperCase();
  }

  setorLabel(): string | null {
    return this.documento.setor?.nome ?? null;
  }

  setorChipClass(): string {
    return chipSetorClass(this.documento.setor);
  }

  extChipClass(): string {
    return chipExtClass(this.documento.extensao);
  }

  metaPartes(): string[] {
    return [formatarTamanho(this.documento.tamanho_bytes), formatarData(this.documento.criado_em)];
  }

  onVisualizar(event: Event): void {
    event.stopPropagation();
    this.visualizar.emit();
  }

  onBaixar(event: Event): void {
    event.stopPropagation();
    this.baixar.emit();
  }
}
