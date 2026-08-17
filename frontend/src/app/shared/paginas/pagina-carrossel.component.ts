import { Component, OnDestroy, computed, effect, input, signal } from '@angular/core';
import { BlocoCarrosselConfig, CarrosselSlide } from '../../models/pagina.model';

@Component({
  selector: 'app-pagina-carrossel',
  standalone: true,
  templateUrl: './pagina-carrossel.component.html',
  styleUrl: './pagina-carrossel.component.scss',
})
export class PaginaCarrosselComponent implements OnDestroy {
  readonly config = input.required<BlocoCarrosselConfig>();
  readonly overlayLegenda = input(false);
  readonly alturaFixa = input<string | null>(null);

  readonly indice = signal(0);

  private autoplayTimer: ReturnType<typeof setInterval> | null = null;

  readonly total = computed(() => this.config().slides?.length || 0);

  constructor() {
    effect(() => {
      const total = this.config().slides?.length ?? 0;
      if (total > 0 && this.indice() >= total) {
        this.indice.set(0);
      }
      this.reiniciarAutoplay();
    });
  }

  ngOnDestroy(): void {
    this.pararAutoplay();
  }

  textoLegenda(slide: CarrosselSlide): string {
    return slide.legenda?.trim() || slide.alt?.trim() || '';
  }

  private reiniciarAutoplay(): void {
    this.pararAutoplay();
    const cfg = this.config();
    if (cfg.autoplay && cfg.slides?.length > 1) {
      const ms = cfg.intervaloMs ?? 5000;
      this.autoplayTimer = setInterval(() => this.proximo(), ms);
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
}
