import {
  Component,
  HostBinding,
  inject,
  Input,
  OnChanges,
  OnDestroy,
  output,
  signal,
  SimpleChanges,
} from '@angular/core';
import { NgStyle } from '@angular/common';
import { Treinamento } from '../../../models/treinamento.model';
import { TreinamentosService } from '../../../services/treinamentos.service';
import { formatarDuracao, THUMB_FALLBACK_GRAD } from '../../../utils/treinamento-categoria.util';
import { DocCatIconeComponent } from '../../../shared/documentos/doc-cat-icone.component';
import { TextTooltipDirective } from '../../../shared/directives/text-tooltip.directive';
import { ICONE_PADRAO } from '../../../models/documento.model';

@Component({
  selector: 'app-treinamento-card',
  standalone: true,
  imports: [NgStyle, DocCatIconeComponent, TextTooltipDirective],
  templateUrl: './treinamento-card.component.html',
  styleUrl: './treinamento-card.component.scss',
})
export class TreinamentoCardComponent implements OnChanges, OnDestroy {
  private readonly treinamentosService = inject(TreinamentosService);

  @Input({ required: true }) video!: Treinamento;
  @Input() modo: 'card' | 'featured' | 'grid' = 'card';

  @HostBinding('class.modo-featured')
  get modoFeatured(): boolean {
    return this.modo === 'featured';
  }

  @HostBinding('class.modo-grid')
  get modoGrid(): boolean {
    return this.modo === 'grid';
  }

  readonly play = output<void>();

  readonly thumbUrl = signal<string | null>(null);
  readonly thumbFalhou = signal(false);
  readonly thumbCarregando = signal(false);

  private objectUrl: string | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['video']) {
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

    if (!this.video?.temThumb) return;

    this.thumbCarregando.set(true);
    this.treinamentosService.carregarThumb(this.video.id).subscribe({
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

  onThumbError(): void {
    this.thumbFalhou.set(true);
    this.thumbUrl.set(null);
    this.revogarObjectUrl();
  }

  private revogarObjectUrl(): void {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }

  temThumbVisivel(): boolean {
    return !!(this.thumbUrl() && !this.thumbFalhou());
  }

  mostrarFallback(): boolean {
    if (this.video?.temThumb && (this.thumbCarregando() || !this.thumbFalhou())) {
      return !this.thumbUrl();
    }
    return !this.thumbUrl() || this.thumbFalhou();
  }

  onClick(): void {
    if (this.modo === 'card' || this.modo === 'grid') {
      this.play.emit();
    }
  }

  thumbStyle(): Record<string, string> {
    if (this.temThumbVisivel()) {
      return { background: '#0f0a22' };
    }
    return { background: THUMB_FALLBACK_GRAD };
  }

  catLabel(): string {
    return this.video.categoriaNome ?? 'Geral';
  }

  catIcone(): string {
    return this.video.categoriaIcone?.trim() || ICONE_PADRAO;
  }

  duracao(): string {
    return formatarDuracao(this.video.duracaoSeg);
  }

  setorLabel(): string | null {
    return this.video.setor?.nome ?? null;
  }

  setorCor(): string | null {
    return this.video.setor?.cor ?? null;
  }
}
