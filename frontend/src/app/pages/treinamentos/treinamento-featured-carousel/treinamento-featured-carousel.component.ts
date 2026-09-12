import {
  Component,
  OnDestroy,
  computed,
  effect,
  input,
  output,
  signal,
} from '@angular/core';
import { Treinamento } from '../../../models/treinamento.model';
import { TreinamentoCardComponent } from '../treinamento-card/treinamento-card.component';

@Component({
  selector: 'app-treinamento-featured-carousel',
  standalone: true,
  imports: [TreinamentoCardComponent],
  templateUrl: './treinamento-featured-carousel.component.html',
  styleUrl: './treinamento-featured-carousel.component.scss',
})
export class TreinamentoFeaturedCarouselComponent implements OnDestroy {
  readonly videos = input.required<Treinamento[]>();

  readonly play = output<Treinamento>();

  readonly indice = signal(0);

  private autoplayTimer: ReturnType<typeof setInterval> | null = null;

  readonly total = computed(() => this.videos().length);

  constructor() {
    effect(() => {
      const total = this.videos().length;
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
    if (this.videos().length > 1) {
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

  onPlay(video: Treinamento): void {
    this.play.emit(video);
  }
}
