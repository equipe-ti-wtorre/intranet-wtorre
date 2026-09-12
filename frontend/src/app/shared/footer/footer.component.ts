import { Component, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { RodapeService } from '../../services/rodape.service';
import { ContentRefreshService } from '../../services/content-refresh.service';
import { FooterConfig, FOOTER_DEFAULTS } from '../../models/rodape.model';

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './footer.component.html',
  styleUrl: './footer.component.scss',
})
export class FooterComponent implements OnInit {
  private readonly rodapeService = inject(RodapeService);
  private readonly contentRefresh = inject(ContentRefreshService);

  readonly config = signal<FooterConfig>(FOOTER_DEFAULTS);

  constructor() {
    this.contentRefresh.rodapeChanged$
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.recarregar());
  }

  ngOnInit(): void {
    this.recarregar();
  }

  recarregar(): void {
    this.rodapeService.getFooter().subscribe({
      next: (cfg) => this.config.set(cfg),
      error: () => {},
    });
  }

  isInterno(link: { url: string | null; tipo_destino: string }): boolean {
    return link.tipo_destino === 'interna' && !!link.url?.startsWith('/');
  }

  isExterno(link: { url: string | null; tipo_destino: string }): boolean {
    return link.tipo_destino === 'externa' && !!link.url;
  }
}
