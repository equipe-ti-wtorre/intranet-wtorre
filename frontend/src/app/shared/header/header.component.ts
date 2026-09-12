import { HttpClient } from '@angular/common/http';
import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
  ViewChild,
  ViewEncapsulation,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { ConfiguracoesService } from '../../services/configuracoes.service';
import { ContentRefreshService } from '../../services/content-refresh.service';
import { HeaderChamadoConfig } from '../../models/configuracoes.model';
import { MenuService } from '../../services/menu.service';
import { MenuItem } from '../../models/menu.model';
import { MenuNodeComponent } from './menu-node/menu-node.component';

const OVERFLOW_THRESHOLD_PX = 4;
const MAX_COMPACT_LEVEL = 2;

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [RouterLink, MenuNodeComponent],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss',
  encapsulation: ViewEncapsulation.None,
})
export class HeaderComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly menuService = inject(MenuService);
  private readonly configService = inject(ConfiguracoesService);
  private readonly contentRefresh = inject(ContentRefreshService);
  private readonly cdr = inject(ChangeDetectorRef);
  readonly auth = inject(AuthService);
  readonly menuItems = signal<MenuItem[]>([]);
  readonly menuAberto = signal(false);
  readonly expandedIds = signal<Set<number>>(new Set());
  readonly mobile = signal(false);
  readonly navCompactLevel = signal(0);
  readonly avatarMenuAberto = signal(false);
  readonly fotoUrl = signal<string | null>(null);
  readonly chamadoConfig = signal<HeaderChamadoConfig | null>(null);

  @ViewChild('navMenu') navMenuRef?: ElementRef<HTMLElement>;
  @ViewChild('navRow') navRowRef?: ElementRef<HTMLElement>;
  @ViewChild('avatarWrap') avatarWrapRef?: ElementRef<HTMLElement>;

  private mediaQuery?: MediaQueryList;
  private resizeObserver?: ResizeObserver;
  private compactRaf = 0;
  private readonly onMediaChange = (e: MediaQueryListEvent) => {
    this.mobile.set(e.matches);
    if (e.matches) this.navCompactLevel.set(0);
    else this.scheduleCompactAdjust();
  };

  constructor() {
    this.contentRefresh.menuChanged$
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.recarregarChamado());
  }

  ngOnInit(): void {
    this.menuService.menu$.subscribe((items) => {
      if (items.length) {
        this.menuItems.set(items);
        this.scheduleCompactAdjust();
      }
    });
    this.menuService.carregarMenu().subscribe();

    this.recarregarChamado();

    if (typeof window !== 'undefined') {
      this.mediaQuery = window.matchMedia('(max-width: 760px)');
      this.mobile.set(this.mediaQuery.matches);
      this.mediaQuery.addEventListener('change', this.onMediaChange);
    }

    if (this.auth.usuario()?.is_ad_user) {
      this.http
        .get(this.auth.getProfilePhotoUrl(), { responseType: 'blob' })
        .subscribe({
          next: (blob) => {
            this.fotoUrl.set(URL.createObjectURL(blob));
          },
          error: () => {
            /* mantém iniciais */
          },
        });
    }
  }

  ngAfterViewInit(): void {
    this.setupResizeObserver();
    this.scheduleCompactAdjust();
  }

  ngOnDestroy(): void {
    this.mediaQuery?.removeEventListener('change', this.onMediaChange);
    cancelAnimationFrame(this.compactRaf);
    this.resizeObserver?.disconnect();
  }

  private setupResizeObserver(): void {
    if (typeof ResizeObserver === 'undefined') return;
    const row = this.navRowRef?.nativeElement;
    if (!row) return;

    this.resizeObserver = new ResizeObserver(() => this.scheduleCompactAdjust());
    this.resizeObserver.observe(row);
  }

  private scheduleCompactAdjust(): void {
    cancelAnimationFrame(this.compactRaf);
    this.compactRaf = requestAnimationFrame(() => this.adjustCompactLevel(0));
  }

  private menuOverflows(nav: HTMLElement, row: HTMLElement): boolean {
    const bars = nav.querySelectorAll<HTMLElement>('.bar-item');
    if (!bars.length) return false;

    const navGap = parseFloat(getComputedStyle(nav).columnGap || getComputedStyle(nav).gap) || 3;
    let contentWidth = 0;
    bars.forEach((el, index) => {
      contentWidth += el.getBoundingClientRect().width;
      if (index > 0) contentWidth += navGap;
    });

    const cta = row.querySelector<HTMLElement>('.header-cta');
    const rowGap = parseFloat(getComputedStyle(row).columnGap || getComputedStyle(row).gap) || 0;
    const availableForNav =
      row.clientWidth - (cta?.getBoundingClientRect().width ?? 0) - rowGap;

    return contentWidth > availableForNav + OVERFLOW_THRESHOLD_PX;
  }

  private adjustCompactLevel(level: number): void {
    if (this.mobile()) {
      this.navCompactLevel.set(0);
      return;
    }

    const nav = this.navMenuRef?.nativeElement;
    const row = this.navRowRef?.nativeElement;
    if (!nav || !row || !nav.children.length) return;

    this.navCompactLevel.set(level);
    this.cdr.detectChanges();

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (this.mobile()) return;

        const overflows = this.menuOverflows(nav, row);
        if (overflows && level < MAX_COMPACT_LEVEL) {
          this.adjustCompactLevel(level + 1);
        }
      });
    });
  }

  toggleExpanded = (id: number): void => {
    this.expandedIds.update((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  toggleMenu(): void {
    this.menuAberto.update((v) => !v);
  }

  fecharMenu = (): void => {
    this.menuAberto.set(false);
    this.expandedIds.set(new Set());
  };

  toggleAvatarMenu(): void {
    this.avatarMenuAberto.update((v) => !v);
  }

  fecharAvatarMenu(): void {
    this.avatarMenuAberto.set(false);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.avatarMenuAberto()) return;
    const target = event.target as Node;
    if (this.avatarWrapRef?.nativeElement.contains(target)) return;
    this.fecharAvatarMenu();
  }

  @HostListener('document:keydown.escape')
  onAvatarMenuEscape(): void {
    if (this.avatarMenuAberto()) this.fecharAvatarMenu();
  }

  recarregarChamado(): void {
    this.configService.getHeaderChamado().subscribe({
      next: (cfg) => {
        this.chamadoConfig.set(cfg);
        this.scheduleCompactAdjust();
      },
      error: () => this.chamadoConfig.set(null),
    });
  }

  sair(): void {
    this.fecharAvatarMenu();
    this.auth.logout();
  }

  mostrarBotaoChamado(): boolean {
    const c = this.chamadoConfig();
    return !!(c?.ativo && c.url);
  }

  isChamadoExterno(): boolean {
    const url = this.chamadoConfig()?.url;
    return !!url && /^https?:\/\//i.test(url);
  }
}
