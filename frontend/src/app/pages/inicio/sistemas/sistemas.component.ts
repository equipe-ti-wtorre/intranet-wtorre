import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { RevealOnScrollDirective } from '../../../shared/directives/reveal-on-scroll.directive';
import { SISTEMAS } from '../../../data/sistemas.data';
import { DocCatIconeComponent } from '../../../shared/documentos/doc-cat-icone.component';
import { MuralComponent } from '../mural/mural.component';
import { MenuService } from '../../../services/menu.service';
import { ContentRefreshService } from '../../../services/content-refresh.service';
import {
  HomeSistemaItem,
  HomeSistemasConfig,
  HOME_SISTEMAS_DEFAULTS,
} from '../../../models/home-sistemas.model';

interface SistemaExibicao {
  id: string;
  nome: string;
  subtitulo: string;
  icon: string;
  url: string | null;
  abrirNovaAba: boolean;
  linkInterno: boolean;
}

@Component({
  selector: 'app-sistemas',
  standalone: true,
  imports: [RevealOnScrollDirective, DocCatIconeComponent, MuralComponent, RouterLink],
  templateUrl: './sistemas.component.html',
  styleUrl: './sistemas.component.scss',
})
export class SistemasComponent implements OnInit {
  private readonly menuService = inject(MenuService);
  private readonly contentRefresh = inject(ContentRefreshService);

  readonly config = signal<HomeSistemasConfig>(structuredClone(HOME_SISTEMAS_DEFAULTS));
  readonly carregando = signal(true);
  readonly usouFallback = signal(false);

  readonly tag = computed(() => this.config().tag);
  readonly titulo = computed(() => this.config().titulo);
  readonly linkTodos = computed(() => this.config().linkTodos);
  readonly linkTodosNovaAba = computed(() => this.config().linkTodosNovaAba);
  readonly linkTodosInterno = computed(() => this.isLinkInterno(this.config().linkTodos));

  readonly sistemas = computed<SistemaExibicao[]>(() => {
    if (this.usouFallback()) {
      return SISTEMAS.map((s, index) => ({
        id: `fallback-${index}`,
        nome: s.nome,
        subtitulo: s.subtitulo,
        icon: s.icon,
        url: null,
        abrirNovaAba: false,
        linkInterno: false,
      }));
    }

    return this.config()
      .itens.filter((item) => item.ativo)
      .sort((a, b) => a.ordem - b.ordem)
      .map((item) => ({
        id: item.id,
        nome: item.nome,
        subtitulo: item.subtitulo,
        icon: item.icon,
        url: item.url,
        abrirNovaAba: item.abrirNovaAba,
        linkInterno: this.isLinkInterno(item.url),
      }));
  });

  constructor() {
    this.contentRefresh.menuChanged$
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.carregar());
  }

  ngOnInit(): void {
    this.carregar();
  }

  isLinkInterno(url: string | null | undefined): boolean {
    return !!url?.trim().startsWith('/');
  }

  private carregar(): void {
    this.menuService.getHomeSistemas().subscribe({
      next: (cfg) => {
        this.config.set(cfg);
        this.usouFallback.set(false);
        this.carregando.set(false);
      },
      error: (_err: HttpErrorResponse) => {
        this.config.set(structuredClone(HOME_SISTEMAS_DEFAULTS));
        this.usouFallback.set(true);
        this.carregando.set(false);
      },
    });
  }
}
