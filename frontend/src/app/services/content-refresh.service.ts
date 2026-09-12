import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Subject, Subscription, timer } from 'rxjs';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { rotaParaModulo } from '../data/admin-modulos';
import { AuthService } from './auth.service';
import { MenuService } from './menu.service';

export type ContentResource =
  | 'menu'
  | 'topbar'
  | 'rodape'
  | 'paginas'
  | 'documentos'
  | 'treinamentos'
  | 'comunicados'
  | 'configuracoes'
  | 'permissoes';

export type ContentVersions = Record<ContentResource, number>;

const POLL_MS = 30_000;

const RESOURCES: ContentResource[] = [
  'menu',
  'topbar',
  'rodape',
  'paginas',
  'documentos',
  'treinamentos',
  'comunicados',
  'configuracoes',
  'permissoes',
];

@Injectable({ providedIn: 'root' })
export class ContentRefreshService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly menuService = inject(MenuService);

  private refCount = 0;
  private timerSub: Subscription | null = null;
  private visibilityHandler: (() => void) | null = null;
  private snapshot: Partial<ContentVersions> = {};
  private initialized = false;

  readonly menuChanged$ = new Subject<void>();
  readonly topbarChanged$ = new Subject<void>();
  readonly rodapeChanged$ = new Subject<void>();
  readonly paginasChanged$ = new Subject<void>();
  readonly documentosChanged$ = new Subject<void>();
  readonly treinamentosChanged$ = new Subject<void>();
  readonly comunicadosChanged$ = new Subject<void>();
  readonly configuracoesChanged$ = new Subject<void>();
  readonly permissoesChanged$ = new Subject<void>();

  private readonly changedSubjects: Record<ContentResource, Subject<void>> = {
    menu: this.menuChanged$,
    topbar: this.topbarChanged$,
    rodape: this.rodapeChanged$,
    paginas: this.paginasChanged$,
    documentos: this.documentosChanged$,
    treinamentos: this.treinamentosChanged$,
    comunicados: this.comunicadosChanged$,
    configuracoes: this.configuracoesChanged$,
    permissoes: this.permissoesChanged$,
  };

  start(): void {
    this.refCount++;
    if (this.refCount === 1) {
      this.startPolling();
    }
  }

  stop(): void {
    if (this.refCount <= 0) return;
    this.refCount--;
    if (this.refCount === 0) {
      this.stopPolling();
    }
  }

  private startPolling(): void {
    if (typeof document === 'undefined') return;

    this.visibilityHandler = () => {
      if (!document.hidden) {
        this.checkVersions();
      }
    };
    document.addEventListener('visibilitychange', this.visibilityHandler);

    this.timerSub = timer(0, POLL_MS).subscribe(() => {
      if (!document.hidden) {
        this.checkVersions();
      }
    });
  }

  private stopPolling(): void {
    if (this.timerSub) {
      this.timerSub.unsubscribe();
      this.timerSub = null;
    }
    if (this.visibilityHandler && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }
  }

  private checkVersions(): void {
    if (!this.auth.estaLogado()) return;

    this.http.get<ContentVersions>(`${environment.apiBaseUrl}/content-version`).subscribe({
      next: (versions) => this.processVersions(versions),
      error: () => {},
    });
  }

  private processVersions(versions: ContentVersions): void {
    if (!this.initialized) {
      for (const resource of RESOURCES) {
        this.snapshot[resource] = versions[resource] ?? 0;
      }
      this.initialized = true;
      return;
    }

    for (const resource of RESOURCES) {
      const prev = this.snapshot[resource] ?? 0;
      const next = versions[resource] ?? 0;
      if (next === prev) continue;

      this.snapshot[resource] = next;

      if (resource === 'permissoes') {
        void this.handlePermissoesChanged();
      }

      this.changedSubjects[resource].next();
    }
  }

  private async handlePermissoesChanged(): Promise<void> {
    try {
      await firstValueFrom(this.auth.carregarPerfil());
      this.menuService.invalidarCache();
      this.reavaliarAcessoRotaAtiva();
    } catch {
      /* ignora */
    }
  }

  reavaliarAcessoRotaAtiva(): void {
    const url = this.router.url;
    if (!url.startsWith('/admin')) return;

    const segments = url.split('/').filter(Boolean);
    if (segments[0] !== 'admin') return;

    const childSegment = segments[1];
    if (!childSegment) return;

    if (childSegment === 'perfis' || childSegment === 'acessos') {
      if (!this.auth.isAdmin()) {
        this.redirectSemModulo();
      }
      return;
    }

    if (childSegment === 'menu') {
      if (
        !this.auth.hasModulo('menu') &&
        !this.auth.hasModulo('rodape') &&
        !this.auth.hasModulo('comunicados')
      ) {
        this.redirectSemModulo();
      }
      return;
    }

    if (childSegment === 'documentos') {
      if (!this.auth.hasModulo('documentos') && !this.auth.hasModulo('treinamentos')) {
        this.redirectSemModulo();
      }
      return;
    }

    const codigo = rotaParaModulo(childSegment);
    if (codigo && !this.auth.hasModulo(codigo)) {
      this.redirectSemModulo();
    }
  }

  private redirectSemModulo(): void {
    const fallback = this.auth.primeiraRotaAdmin();
    if (fallback) {
      void this.router.navigate(['/admin', fallback]);
    } else {
      void this.router.navigate(['/inicio']);
    }
  }
}
