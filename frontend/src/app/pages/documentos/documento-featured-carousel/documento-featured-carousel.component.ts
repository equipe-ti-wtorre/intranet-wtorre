import {
  Component,
  OnDestroy,
  computed,
  effect,
  input,
  output,
  signal,
} from '@angular/core';
import { Documento } from '../../../models/documento.model';
import { DocumentoFeaturedCardComponent } from '../documento-featured-card/documento-featured-card.component';

@Component({
  selector: 'app-documento-featured-carousel',
  standalone: true,
  imports: [DocumentoFeaturedCardComponent],
  templateUrl: './documento-featured-carousel.component.html',
  styleUrl: './documento-featured-carousel.component.scss',
})
export class DocumentoFeaturedCarouselComponent implements OnDestroy {
  readonly documentos = input.required<Documento[]>();
  readonly iconeCategoria = input<string | null>(null);
  readonly kicker = input('GRUPO WTORRE');

  readonly visualizar = output<Documento>();
  readonly baixar = output<Documento>();

  readonly indice = signal(0);

  private autoplayTimer: ReturnType<typeof setInterval> | null = null;

  readonly total = computed(() => this.documentos().length);

  constructor() {
    effect(() => {
      const total = this.documentos().length;
      if (total > 0 && this.indice() >= total) {
        this.indice.set(0);
      }
      this.reiniciarAutoplay();
    });
  }

  ngOnDestroy(): void {
    this.pararAutoplay();
  }

  private reiniciarAutoplay(): void {
    this.pararAutoplay();
    if (this.documentos().length > 1) {
      this.autoplayTimer = setInterval(() => this.proximo(), 5000);
    }
  }

  private pararAutoplay(): void {
    if (this.autoplayTimer) {
      clearInterval(this.autoplayTimer);
      this.autoplayTimer = null;
    }
  }

  irPara(i: number): void {
    const total = this.total();
    if (total === 0) return;
    this.indice.set(((i % total) + total) % total);
  }

  anterior(): void {
    this.irPara(this.indice() - 1);
  }

  proximo(): void {
    this.irPara(this.indice() + 1);
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.anterior();
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      this.proximo();
    }
  }

  onVisualizar(doc: Documento): void {
    this.visualizar.emit(doc);
  }

  onBaixar(doc: Documento): void {
    this.baixar.emit(doc);
  }
}
