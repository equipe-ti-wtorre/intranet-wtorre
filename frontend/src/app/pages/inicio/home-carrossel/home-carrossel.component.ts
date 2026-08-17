import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { MenuService } from '../../../services/menu.service';
import { ContentRefreshService } from '../../../services/content-refresh.service';
import { PaginaCarrosselComponent } from '../../../shared/paginas/pagina-carrossel.component';
import {
  HomeCarrosselConfig,
  HOME_CARROSSEL_DEFAULTS,
} from '../../../models/home-carrossel.model';
import { BlocoCarrosselConfig } from '../../../models/pagina.model';

@Component({
  selector: 'app-home-carrossel',
  standalone: true,
  imports: [PaginaCarrosselComponent],
  templateUrl: './home-carrossel.component.html',
  styleUrl: './home-carrossel.component.scss',
})
export class HomeCarrosselComponent implements OnInit, OnDestroy {
  private readonly menuService = inject(MenuService);
  private readonly contentRefresh = inject(ContentRefreshService);

  readonly config = signal<HomeCarrosselConfig>(structuredClone(HOME_CARROSSEL_DEFAULTS));
  readonly carregando = signal(true);

  readonly carrosselBloco = computed<BlocoCarrosselConfig>(() => {
    const cfg = this.config();
    return {
      autoplay: cfg.autoplay,
      intervaloMs: cfg.intervaloMs,
      slides: cfg.slides.map((s) => ({
        url: s.url,
        alt: s.alt,
        legenda: s.legenda?.trim() || s.alt?.trim() || undefined,
        link: s.link ?? undefined,
      })),
    };
  });

  readonly temSlides = computed(() => (this.config().slides?.length ?? 0) > 0);

  readonly bannerHeight = computed(() => `${this.config().alturaPx}px`);

  constructor() {
    this.contentRefresh.menuChanged$
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.carregar());
  }

  ngOnInit(): void {
    this.carregar();
  }

  ngOnDestroy(): void {}

  private carregar(): void {
    this.menuService.getHomeCarrossel().subscribe({
      next: (cfg) => {
        this.config.set(cfg);
        this.carregando.set(false);
      },
      error: (_err: HttpErrorResponse) => {
        this.config.set(structuredClone(HOME_CARROSSEL_DEFAULTS));
        this.carregando.set(false);
      },
    });
  }
}
