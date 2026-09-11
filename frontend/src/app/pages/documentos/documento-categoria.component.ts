import { Component, OnDestroy, OnInit, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DOCUMENT } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { forkJoin } from 'rxjs';
import { PublicChromeComponent } from '../../shared/public-chrome/public-chrome.component';
import { FooterComponent } from '../../shared/footer/footer.component';
import { DocumentosService } from '../../services/documentos.service';
import { ContentRefreshService } from '../../services/content-refresh.service';
import { AuthService } from '../../services/auth.service';
import { DocumentoFeaturedCarouselComponent } from './documento-featured-carousel/documento-featured-carousel.component';
import { DocumentoGridCardComponent } from './documento-grid-card/documento-grid-card.component';
import { DocumentoPreviewModalComponent } from './documento-preview-modal.component';
import {
  CategoriaDocumento,
  Documento,
  DocumentoPagina,
  DocumentoSetor,
  PREVIEWABLE_EXTENSIONS,
} from '../../models/documento.model';
import { DocCatIconeComponent } from '../../shared/documentos/doc-cat-icone.component';
import { DocCatIconeService } from '../../shared/documentos/doc-cat-icone.service';
import { TreinamentosService } from '../../services/treinamentos.service';
import { Treinamento } from '../../models/treinamento.model';
import { formatarDuracao } from '../../utils/treinamento-categoria.util';
import { TreinamentoCardComponent } from '../treinamentos/treinamento-card/treinamento-card.component';
import { TreinamentoFeaturedCarouselComponent } from '../treinamentos/treinamento-featured-carousel/treinamento-featured-carousel.component';
import { filtrarDocumentos, corEntidadeTab, entidadeTabGradiente } from './documento.util';

interface ItemNavCategoria {
  slug: string;
  nome: string;
  icone?: string | null;
  isChild: boolean;
  parentSlug?: string;
}

const DESC_ENTIDADE_FALLBACK =
  'Repositório central de documentos do grupo. Selecione uma categoria para visualizar ou baixar os arquivos.';

const CHIP_CORES = ['#1d54e6', '#7c3aed', '#0d9488', '#f59e0b', '#22c55e', '#ef4444'];

@Component({
  selector: 'app-documento-categoria',
  standalone: true,
  imports: [
    PublicChromeComponent,
    FooterComponent,
    FormsModule,
    RouterLink,
    DocumentoFeaturedCarouselComponent,
    DocumentoGridCardComponent,
    DocumentoPreviewModalComponent,
    DocCatIconeComponent,
    TreinamentoCardComponent,
    TreinamentoFeaturedCarouselComponent,
  ],
  templateUrl: './documento-categoria.component.html',
  styleUrl: './documento-categoria.component.scss',
})
export class DocumentoCategoriaComponent implements OnInit, OnDestroy {
  private readonly documentosService = inject(DocumentosService);
  private readonly treinamentosService = inject(TreinamentosService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly contentRefresh = inject(ContentRefreshService);
  private readonly iconeService = inject(DocCatIconeService);

  readonly pagina = signal<DocumentoPagina | null>(null);
  readonly paginas = signal<DocumentoPagina[]>([]);
  readonly setores = signal<DocumentoSetor[]>([]);
  readonly arvore = signal<CategoriaDocumento[]>([]);
  readonly categoriaRaiz = signal<CategoriaDocumento | null>(null);
  readonly documentos = signal<Documento[]>([]);
  readonly treinamentos = signal<Treinamento[]>([]);
  readonly subAtiva = signal<string | null>(null);
  readonly setorAtivo = signal<string | null>(null);
  readonly busca = signal('');
  readonly carregando = signal(true);
  readonly carregandoConteudo = signal(false);
  readonly erro = signal('');
  readonly playerAberto = signal(false);
  readonly videoAtivo = signal<Treinamento | null>(null);
  readonly sasUrl = signal<string | null>(null);
  readonly playerCarregando = signal(false);
  readonly modalAberto = signal(false);
  readonly modalTitulo = signal('');
  readonly modalUrl = signal<SafeResourceUrl | null>(null);
  readonly modalCarregando = signal(false);
  readonly categoriasExpandidas = signal<Set<string>>(new Set());

  readonly temSubcategorias = computed(
    () => (this.categoriaRaiz()?.children?.length ?? 0) > 0
  );

  readonly itensNav = computed((): ItemNavCategoria[] => {
    const raiz = this.categoriaRaiz();
    if (!raiz) return [];

    const items: ItemNavCategoria[] = [];
    if ((raiz.children?.length ?? 0) > 0) {
      items.push({ slug: 'geral', nome: 'Geral', icone: null, isChild: true, parentSlug: raiz.slug });
      for (const child of raiz.children ?? []) {
        items.push({
          slug: child.slug,
          nome: child.nome,
          icone: child.icone,
          isChild: true,
          parentSlug: raiz.slug,
        });
      }
    }
    return items;
  });

  readonly subcategoriaAtual = computed((): ItemNavCategoria | null => {
    const slug = this.subAtiva();
    if (!slug) return null;
    return this.itensNav().find((item) => item.slug === slug) ?? null;
  });

  readonly documentosFiltrados = computed(() =>
    filtrarDocumentos(this.documentos(), this.busca())
  );

  readonly documentosDestaque = computed(() => {
    const lista = this.documentosFiltrados();
    const marcados = lista.filter((d) => d.destaque);
    if (marcados.length) return marcados;
    return lista.length ? [lista[0]] : [];
  });

  readonly documentosGrade = computed(() => this.documentosFiltrados());

  readonly treinamentosDestaque = computed(() => {
    const lista = this.treinamentosFiltrados();
    const marcados = lista.filter((v) => v.destaque);
    if (marcados.length) return marcados;
    return lista.length ? [lista[0]] : [];
  });

  readonly treinamentosGrade = computed(() => this.treinamentosFiltrados());

  readonly mostrarSecaoGrade = computed(
    () => this.documentosGrade().length > 0 || this.treinamentosGrade().length > 0
  );

  readonly treinamentosFiltrados = computed(() => {
    const f = this.busca().trim().toLowerCase();
    const lista = this.treinamentos();
    if (!f) return lista;
    return lista.filter((v) => {
      const hay = `${v.titulo} ${v.setor?.nome ?? ''} ${v.categoriaNome ?? ''} ${v.descricao ?? ''}`.toLowerCase();
      return hay.includes(f);
    });
  });

  readonly temTreinamentos = computed(
    () => !this.carregandoConteudo() && this.treinamentosFiltrados().length > 0
  );

  readonly temDocumentos = computed(
    () => !this.carregandoConteudo() && this.documentosFiltrados().length > 0
  );

  readonly temDestaque = computed(
    () => !this.carregandoConteudo() && this.documentosDestaque().length > 0
  );

  readonly temDestaqueTreinamentos = computed(
    () => !this.carregandoConteudo() && this.treinamentosDestaque().length > 0
  );

  readonly temResultados = computed(
    () => this.temTreinamentos() || this.temDocumentos()
  );

  private blobUrlAtual: string | null = null;

  constructor() {
    effect(() => {
      if (!this.playerAberto()) return;
      const handler = (e: KeyboardEvent) => {
        if (e.key === 'Escape') this.fecharPlayer();
      };
      document.addEventListener('keydown', handler);
      return () => document.removeEventListener('keydown', handler);
    });

    this.contentRefresh.documentosChanged$
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.recarregar());

    this.contentRefresh.treinamentosChanged$
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.recarregar());
  }

  ngOnInit(): void {
    this.document.body.classList.add('pagina-inicio');
    this.auth.carregarPerfil().subscribe();
    this.route.paramMap.subscribe((params) => {
      const slug = params.get('slug');
      if (slug) {
        this.resolverPagina(slug);
      }
    });
    this.route.queryParamMap.subscribe(() => {
      if (!this.carregando() && this.arvore().length) {
        this.aplicarQueryDaUrl();
      }
    });
  }

  ngOnDestroy(): void {
    this.document.body.classList.remove('pagina-inicio');
    this.fecharModal();
    this.fecharPlayer();
  }

  recarregar(): void {
    const slug = this.route.snapshot.paramMap.get('slug');
    if (slug) {
      this.resolverPagina(slug, false);
    }
  }

  selecionarPagina(slug: string): void {
    if (slug === this.pagina()?.slug) return;
    this.router.navigate(['/documentos', slug]);
  }

  descricaoEntidade(pag: DocumentoPagina): string {
    return pag.descricao?.trim() || DESC_ENTIDADE_FALLBACK;
  }

  selecionarCategoriaRaiz(cat: CategoriaDocumento): void {
    this.expandirCategoria(cat.slug);
    const queryParams: Record<string, string | null> = {
      cat: cat.slug,
      sub: null,
      setor: this.setorAtivo(),
    };
    if ((cat.children?.length ?? 0) > 0) {
      queryParams['sub'] = 'geral';
    }
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  selecionarSubcategoriaSidebar(raiz: CategoriaDocumento, child: CategoriaDocumento): void {
    this.expandirCategoria(raiz.slug);
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { cat: raiz.slug, sub: child.slug },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  toggleExpandirCategoria(slug: string, event: Event): void {
    event.stopPropagation();
    const next = new Set(this.categoriasExpandidas());
    if (next.has(slug)) {
      next.delete(slug);
    } else {
      next.add(slug);
    }
    this.categoriasExpandidas.set(next);
  }

  isExpandida(cat: CategoriaDocumento): boolean {
    return this.categoriasExpandidas().has(cat.slug);
  }

  temFilhos(cat: CategoriaDocumento): boolean {
    return (cat.children?.length ?? 0) > 0;
  }

  totalCount(cat: CategoriaDocumento): number {
    if ((cat.children?.length ?? 0) > 0) {
      return (cat.children ?? []).reduce((sum, c) => sum + (c.documentos_count ?? 0), cat.documentos_count ?? 0);
    }
    return cat.documentos_count ?? 0;
  }

  corSubcategoria(index: number): string {
    return CHIP_CORES[index % CHIP_CORES.length];
  }

  corTabEntidade(slug: string): string {
    return corEntidadeTab(slug);
  }

  gradienteTabEntidade(slug: string): string | null {
    return entidadeTabGradiente(slug);
  }

  iconeCategoriaAtual(): string | null {
    return this.categoriaRaiz()?.icone ?? null;
  }

  isSubcategoriaSidebarAtiva(raiz: CategoriaDocumento, child: CategoriaDocumento): boolean {
    return this.isCategoriaAtiva(raiz) && this.subAtiva() === child.slug;
  }

  private expandirCategoria(slug: string): void {
    const next = new Set(this.categoriasExpandidas());
    next.add(slug);
    this.categoriasExpandidas.set(next);
  }

  selecionarSub(slug: string): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { sub: slug },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  selecionarSetor(slug: string | null): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { setor: slug },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  iconeNavItem(item: ItemNavCategoria): string | null {
    if (item.slug === 'geral') {
      return this.iconeService.defaultIcone();
    }
    return item.icone ?? this.iconeService.defaultIcone();
  }

  isCategoriaAtiva(cat: CategoriaDocumento): boolean {
    return this.categoriaRaiz()?.slug === cat.slug;
  }

  private resolverPagina(paginaSlug: string, mostrarCarregando = true): void {
    if (mostrarCarregando || !this.pagina()) {
      this.carregando.set(true);
    }
    this.erro.set('');

    forkJoin({
      paginas: this.documentosService.listarPaginas(),
      setores: this.documentosService.listarSetores(),
    }).subscribe({
      next: ({ paginas, setores }) => {
        this.paginas.set(paginas);
        this.setores.set(setores);

        const found = paginas.find((p) => p.slug === paginaSlug);
        if (found) {
          this.pagina.set(found);
          this.carregarArvore(paginaSlug);
          return;
        }

        this.documentosService.resolverSlugLegado(paginaSlug).subscribe({
          next: (resolved) => {
            const queryParams: Record<string, string> = { cat: resolved.categoria_slug };
            if (resolved.sub_slug) {
              queryParams['sub'] = resolved.sub_slug;
            }
            this.router.navigate(['/documentos', resolved.pagina_slug], {
              queryParams,
              replaceUrl: true,
            });
          },
          error: () => {
            this.erro.set('Página não encontrada.');
            this.carregando.set(false);
          },
        });
      },
      error: (err: HttpErrorResponse) => {
        this.erro.set(err.error?.mensagem || 'Erro ao carregar página.');
        this.carregando.set(false);
      },
    });
  }

  private carregarArvore(paginaSlug: string): void {
    this.documentosService.listarCategoriasPorPagina(paginaSlug).subscribe({
      next: (tree) => {
        this.arvore.set(tree);
        this.carregando.set(false);
        this.aplicarQueryDaUrl();
      },
      error: (err: HttpErrorResponse) => {
        this.erro.set(err.error?.mensagem || 'Erro ao carregar categorias.');
        this.carregando.set(false);
      },
    });
  }

  private aplicarQueryDaUrl(): void {
    const tree = this.arvore();
    if (!tree.length) {
      this.categoriaRaiz.set(null);
      this.documentos.set([]);
      this.treinamentos.set([]);
      return;
    }

    const catParam = this.route.snapshot.queryParamMap.get('cat');
    const setorParam = this.route.snapshot.queryParamMap.get('setor');
    this.setorAtivo.set(setorParam);

    let raiz = catParam ? tree.find((c) => c.slug === catParam) ?? null : null;
    if (!raiz) {
      raiz = tree[0];
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { cat: raiz.slug, sub: (raiz.children?.length ?? 0) > 0 ? 'geral' : null },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
      return;
    }

    this.categoriaRaiz.set(raiz);
    this.expandirCategoria(raiz.slug);

    const filhos = raiz.children ?? [];
    if (filhos.length > 0) {
      const subParam = this.route.snapshot.queryParamMap.get('sub');
      const nav = this.itensNav();
      let sub = subParam && nav.some((n) => n.slug === subParam) ? subParam : 'geral';
      this.subAtiva.set(sub);
      if (subParam !== sub) {
        this.router.navigate([], {
          relativeTo: this.route,
          queryParams: { sub },
          queryParamsHandling: 'merge',
          replaceUrl: true,
        });
      }
      this.carregarConteudo(sub === 'geral' ? raiz.slug : sub, setorParam);
    } else {
      this.subAtiva.set(null);
      this.carregarConteudo(raiz.slug, setorParam);
    }
  }

  private recarregarConteudo(): void {
    const raiz = this.categoriaRaiz();
    const pag = this.pagina();
    if (!raiz || !pag) return;

    const sub = this.subAtiva();
    const categoriaSlug =
      sub && sub !== 'geral' ? sub : raiz.slug;
    this.carregarConteudo(categoriaSlug, this.setorAtivo());
  }

  private carregarConteudo(categoriaSlug: string, setor: string | null): void {
    const pag = this.pagina();
    if (!pag) return;

    this.carregandoConteudo.set(true);
    this.erro.set('');

    forkJoin({
      docs: this.documentosService.listarDocumentos(categoriaSlug, setor, pag.slug),
      videos: this.treinamentosService.listar(pag.slug, { categoriaSlug, setor: setor ?? undefined }),
    }).subscribe({
      next: ({ docs, videos }) => {
        this.documentos.set(docs);
        this.treinamentos.set(videos);
        this.carregandoConteudo.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.erro.set(err.error?.mensagem || 'Erro ao carregar conteúdo.');
        this.carregandoConteudo.set(false);
      },
    });
  }

  abrirTreinamento(video: Treinamento): void {
    this.videoAtivo.set(video);
    this.playerAberto.set(true);
    this.sasUrl.set(null);
    this.playerCarregando.set(true);

    this.treinamentosService.playback(video.id).subscribe({
      next: (resp) => {
        this.sasUrl.set(resp.url);
        this.playerCarregando.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.erro.set(err.error?.mensagem || 'Erro ao carregar vídeo.');
        this.playerCarregando.set(false);
        this.fecharPlayer();
      },
    });
  }

  fecharPlayer(): void {
    this.playerAberto.set(false);
    this.sasUrl.set(null);
    this.videoAtivo.set(null);
    this.playerCarregando.set(false);
  }

  onOverlayClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('overlay')) {
      this.fecharPlayer();
    }
  }

  categoriaLabel(v: Treinamento): string {
    return v.categoriaNome ?? 'Geral';
  }

  duracao(v: Treinamento): string {
    return formatarDuracao(v.duracaoSeg);
  }

  visualizar(doc: Documento): void {
    if (!PREVIEWABLE_EXTENSIONS.includes(doc.extensao)) {
      this.baixar(doc);
      return;
    }
    this.modalAberto.set(true);
    this.modalTitulo.set(doc.titulo);
    this.modalCarregando.set(true);
    this.documentosService.visualizar(doc.id).subscribe({
      next: (blob) => {
        this.revogarBlob();
        this.blobUrlAtual = URL.createObjectURL(blob);
        this.modalUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(this.blobUrlAtual));
        this.modalCarregando.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.erro.set(err.error?.mensagem || 'Erro ao visualizar documento.');
        this.fecharModal();
      },
    });
  }

  baixar(doc: Documento): void {
    this.documentosService.baixar(doc.id).subscribe({
      next: (blob) => this.documentosService.downloadBlob(blob, doc.nome_original),
      error: (err: HttpErrorResponse) =>
        this.erro.set(err.error?.mensagem || 'Erro ao baixar documento.'),
    });
  }

  fecharModal(): void {
    this.modalAberto.set(false);
    this.modalUrl.set(null);
    this.modalTitulo.set('');
    this.revogarBlob();
  }

  private revogarBlob(): void {
    if (this.blobUrlAtual) {
      URL.revokeObjectURL(this.blobUrlAtual);
      this.blobUrlAtual = null;
    }
  }
}
