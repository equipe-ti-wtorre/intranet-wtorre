import { Component, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { PublicChromeComponent } from '../../shared/public-chrome/public-chrome.component';
import { FooterComponent } from '../../shared/footer/footer.component';
import { PaginasService } from '../../services/paginas.service';
import { ContentRefreshService } from '../../services/content-refresh.service';
import { Pagina } from '../../models/pagina.model';
import { PaginaBlocosRendererComponent } from '../../shared/paginas/pagina-blocos-renderer.component';

@Component({
  selector: 'app-pagina-publica',
  standalone: true,
  imports: [PublicChromeComponent, FooterComponent, RouterLink, PaginaBlocosRendererComponent],
  templateUrl: './pagina-publica.component.html',
  styleUrl: './pagina-publica.component.scss',
})
export class PaginaPublicaComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly paginasService = inject(PaginasService);
  private readonly contentRefresh = inject(ContentRefreshService);

  readonly pagina = signal<Pagina | null>(null);
  readonly carregando = signal(true);
  readonly naoEncontrada = signal(false);

  constructor() {
    this.contentRefresh.paginasChanged$
      .pipe(takeUntilDestroyed())
      .subscribe(() => {
        const slug = this.route.snapshot.paramMap.get('slug') || '';
        if (slug) this.carregar(slug, false);
      });
  }

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const slug = params.get('slug') || '';
      this.carregar(slug);
    });
  }

  carregar(slug: string, mostrarCarregando = true): void {
    if (mostrarCarregando || !this.pagina()) {
      this.carregando.set(true);
    }
    this.naoEncontrada.set(false);
    this.paginasService.buscarPorSlug(slug).subscribe({
      next: (p) => {
        this.pagina.set(p);
        this.carregando.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.carregando.set(false);
        if (err.status === 404) {
          this.naoEncontrada.set(true);
        }
      },
    });
  }
}
