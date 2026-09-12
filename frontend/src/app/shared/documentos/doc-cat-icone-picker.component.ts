import {
  Component,
  computed,
  inject,
  input,
  OnDestroy,
  OnInit,
  output,
  signal,
  ViewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CdkVirtualScrollViewport, ScrollingModule } from '@angular/cdk/scrolling';
import { HttpErrorResponse } from '@angular/common/http';
import { auditTime, Subscription } from 'rxjs';
import {
  BrandIndexEntry,
  IconChip,
  ICONE_PADRAO,
  IconeSegmento,
  LucideIndexEntry,
  MaterialIndexEntry,
} from '../../models/documento.model';
import { AlertasService } from '../../services/alertas.service';
import { IconesService } from '../../services/icones.service';
import { AdminDropzoneComponent } from '../admin/admin-dropzone/admin-dropzone.component';
import { DocCatIconeComponent } from './doc-cat-icone.component';
import { DocCatIconeService } from './doc-cat-icone.service';
import {
  ICON_PAGE_SIZE,
  IconSearchResult,
  getInitialBrandIcons,
  getInitialLucideIcons,
  getInitialMaterialIcons,
  isChipForSegment,
  searchAllIcons,
  segmentoBadgeLabel,
} from './icon-search.util';

@Component({
  selector: 'app-doc-cat-icone-picker',
  standalone: true,
  imports: [FormsModule, ScrollingModule, DocCatIconeComponent, AdminDropzoneComponent],
  templateUrl: './doc-cat-icone-picker.component.html',
  styleUrl: './doc-cat-icone-picker.component.scss',
})
export class DocCatIconePickerComponent implements OnInit, OnDestroy {
  private readonly iconeService = inject(DocCatIconeService);
  private readonly iconesService = inject(IconesService);
  private readonly alertas = inject(AlertasService);
  private scrollSub?: Subscription;

  @ViewChild(CdkVirtualScrollViewport)
  set gridViewport(vp: CdkVirtualScrollViewport | undefined) {
    this.scrollSub?.unsubscribe();
    this.scrollSub = undefined;
    if (!vp) return;
    this.scrollSub = vp
      .elementScrolled()
      .pipe(auditTime(80))
      .subscribe(() => this.verificarFimDoScroll(vp));
  }

  readonly value = input<string | null>(ICONE_PADRAO);
  readonly optional = input(false);
  readonly collapsible = input(false);
  readonly valueChange = output<string>();

  readonly expandido = signal(false);

  readonly segmento = signal<IconeSegmento>('lucide');
  readonly busca = signal('');
  readonly carregando = signal(true);
  readonly uploadando = signal(false);
  readonly chips = signal<IconChip[]>([]);
  readonly lucideEntries = signal<LucideIndexEntry[]>([]);
  readonly brandEntries = signal<BrandIndexEntry[]>([]);
  readonly materialEntries = signal<MaterialIndexEntry[]>([]);
  readonly synonymsMap = signal<Record<string, string>>({});
  readonly visibleLimit = signal(ICON_PAGE_SIZE);

  readonly buscaGlobal = computed(() => !!this.busca().trim());

  readonly resultadoFonte = computed((): IconSearchResult[] => {
    const q = this.busca().trim();
    const semLimite = Number.POSITIVE_INFINITY;

    if (q) {
      return searchAllIcons(
        this.lucideEntries(),
        this.brandEntries(),
        this.materialEntries(),
        q,
        this.synonymsMap(),
        semLimite
      );
    }

    if (this.segmento() === 'custom') {
      return [];
    }

    if (this.segmento() === 'brand') {
      return getInitialBrandIcons(this.brandEntries(), semLimite);
    }

    if (this.segmento() === 'material') {
      return getInitialMaterialIcons(this.materialEntries(), semLimite);
    }

    return getInitialLucideIcons(this.lucideEntries(), semLimite);
  });

  readonly resultados = computed(() =>
    this.resultadoFonte().slice(0, this.visibleLimit())
  );

  readonly temMais = computed(
    () => this.resultados().length < this.resultadoFonte().length
  );

  readonly contador = computed(() => {
    const total = this.resultadoFonte().length;
    const shown = this.resultados().length;
    const buscando = this.buscaGlobal();

    if (this.segmento() === 'custom' && !buscando) {
      return 'Envie um arquivo SVG para usar como ícone personalizado';
    }

    if (!total) {
      return buscando ? 'Nenhum resultado' : 'Nenhum ícone disponível';
    }
    if (!buscando) {
      return `Mostrando ${shown} de ${total.toLocaleString('pt-BR')} ícones`;
    }
    if (this.temMais()) {
      return `Mostrando ${shown} de ${total.toLocaleString('pt-BR')} resultados (Lucide + Marcas + Material) · role para carregar mais`;
    }
    return `${total.toLocaleString('pt-BR')} resultado${total === 1 ? '' : 's'} (Lucide + Marcas + Material)`;
  });

  readonly colunas = 8;
  readonly linhas = computed(() => {
    const items = this.resultados();
    const rows: IconSearchResult[][] = [];
    for (let i = 0; i < items.length; i += this.colunas) {
      rows.push(items.slice(i, i + this.colunas));
    }
    return rows;
  });

  readonly itemSize = 44;
  private readonly viewportAlturaPx = 220;

  readonly segmentoBadgeLabel = segmentoBadgeLabel;

  readonly iconeCustomSelecionado = computed(() => {
    const val = this.value();
    if (!val?.trim()) return null;
    const resolved = this.iconeService.resolve(val);
    return resolved.segmento === 'custom' ? resolved.namespaced : null;
  });

  ngOnInit(): void {
    void this.initCatalog();
  }

  ngOnDestroy(): void {
    this.scrollSub?.unsubscribe();
  }

  async initCatalog(): Promise<void> {
    this.carregando.set(true);
    try {
      await this.iconeService.preloadPickerCatalog();
      const [lucide, brands, material, synonyms, chips] = await Promise.all([
        this.iconeService.loadLucideIndex(),
        this.iconeService.loadBrandIndex(),
        this.iconeService.loadMaterialIndex(),
        this.iconeService.loadSynonyms(),
        this.iconeService.loadChips(),
      ]);
      this.lucideEntries.set(lucide);
      this.brandEntries.set(brands);
      this.materialEntries.set(material);
      this.synonymsMap.set(synonyms);
      this.chips.set(chips);
      await this.iconeService.ensureBrandSprite();
    } finally {
      this.carregando.set(false);
    }
  }

  selecionar(namespaced: string): void {
    this.valueChange.emit(namespaced);
    if (this.collapsible()) {
      this.expandido.set(false);
    }
  }

  temValor(): boolean {
    const raw = this.value();
    return !!raw?.trim();
  }

  abrirPicker(): void {
    this.expandido.set(true);
  }

  fecharPicker(): void {
    this.expandido.set(false);
    this.busca.set('');
    this.visibleLimit.set(ICON_PAGE_SIZE);
  }

  selecionado(namespaced: string): boolean {
    const raw = this.value();
    if (this.optional() && !raw?.trim()) return false;
    const atual = this.iconeService.normalizarParaLeitura(raw);
    return atual === namespaced;
  }

  setSegmento(seg: IconeSegmento): void {
    this.segmento.set(seg);
    this.busca.set('');
    this.visibleLimit.set(ICON_PAGE_SIZE);
    if (seg === 'brand') {
      void this.iconeService.ensureBrandSprite();
    } else if (seg === 'material') {
      void this.iconeService.ensureMaterialSprite();
    }
  }

  aplicarBusca(termo: string): void {
    this.busca.set(termo);
    this.visibleLimit.set(ICON_PAGE_SIZE);
    if (termo.trim()) {
      void this.preloadSpritesGlobais();
    }
  }

  carregarMais(): void {
    if (!this.temMais()) return;
    this.visibleLimit.update((n) => n + ICON_PAGE_SIZE);
  }

  onViewportScroll(firstVisibleIndex: number): void {
    if (!this.temMais()) return;
    const totalRows = this.linhas().length;
    if (!totalRows) return;
    const visibleRows = Math.ceil(this.viewportAlturaPx / this.itemSize);
    if (firstVisibleIndex + visibleRows >= totalRows) {
      this.carregarMais();
    }
  }

  private verificarFimDoScroll(vp: CdkVirtualScrollViewport): void {
    if (!this.temMais()) return;
    if (vp.measureScrollOffset('bottom') < 80) {
      this.carregarMais();
    }
  }

  private preloadSpritesGlobais(): void {
    void Promise.all([
      this.iconeService.ensureBrandSprite(),
      this.iconeService.ensureMaterialSprite(),
    ]);
  }

  aplicarChip(chip: IconChip): void {
    if (chip.segment) {
      this.segmento.set(chip.segment);
    }
    this.aplicarBusca(chip.query);
  }

  chipVisivel(chip: IconChip): boolean {
    if (this.buscaGlobal()) return true;
    return isChipForSegment(chip, this.segmento());
  }

  onSvgFile(file: File): void {
    this.uploadando.set(true);
    this.iconesService.uploadIconeCustom(file).subscribe({
      next: (res) => {
        this.selecionar(res.icone);
        this.uploadando.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.alertas.erro(err.error?.mensagem || 'Erro ao enviar ícone SVG.');
        this.uploadando.set(false);
      },
    });
  }

  trackRow(_: number, row: IconSearchResult[]): string {
    return row.map((r) => r.namespaced).join('|');
  }
}
