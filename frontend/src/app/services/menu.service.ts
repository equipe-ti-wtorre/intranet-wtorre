import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable, tap, catchError, of } from 'rxjs';
import { environment } from '../../environments/environment';
import { MenuItem, MenuItemPayload, MenuReorderItem } from '../models/menu.model';
import {
  TopbarConfig,
  TopbarLogoUploadResponse,
  TOPBAR_DEFAULTS,
} from '../models/topbar.model';
import {
  HomeCarrosselConfig,
  HomeCarrosselUploadResponse,
  HOME_CARROSSEL_DEFAULTS,
} from '../models/home-carrossel.model';
import {
  HomeSistemasConfig,
  HOME_SISTEMAS_DEFAULTS,
} from '../models/home-sistemas.model';
import { HeaderChamadoConfig } from '../models/configuracoes.model';
import { LoginConfig, LOGIN_DEFAULTS } from '../models/login.model';
import { navDataToMenuTree } from '../data/nav.data';

@Injectable({ providedIn: 'root' })
export class MenuService {
  private readonly http = inject(HttpClient);
  private cache: MenuItem[] | null = null;
  private readonly menuSubject = new BehaviorSubject<MenuItem[]>([]);
  readonly menu$ = this.menuSubject.asObservable();

  private api(path: string): string {
    return `${environment.apiBaseUrl}${path}`;
  }

  carregarMenu(forceRefresh = false): Observable<MenuItem[]> {
    if (this.cache && !forceRefresh) {
      this.menuSubject.next(this.cache);
      return of(this.cache);
    }

    return this.http.get<MenuItem[]>(this.api('/menu')).pipe(
      tap((items) => {
        this.cache = items;
        this.menuSubject.next(items);
      }),
      catchError(() => {
        const fallback = navDataToMenuTree();
        this.menuSubject.next(fallback);
        return of(fallback);
      })
    );
  }

  invalidarCache(): void {
    this.cache = null;
    this.carregarMenu(true).subscribe();
  }

  listarTodos(): Observable<MenuItem[]> {
    return this.http.get<MenuItem[]>(this.api('/menu/admin'));
  }

  criar(payload: MenuItemPayload): Observable<MenuItem> {
    return this.http.post<MenuItem>(this.api('/menu'), payload).pipe(
      tap(() => this.invalidarCache())
    );
  }

  atualizar(id: number, payload: MenuItemPayload): Observable<MenuItem> {
    return this.http.put<MenuItem>(this.api(`/menu/${id}`), payload).pipe(
      tap(() => this.invalidarCache())
    );
  }

  remover(id: number): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(this.api(`/menu/${id}`)).pipe(
      tap(() => this.invalidarCache())
    );
  }

  reordenar(items: MenuReorderItem[]): Observable<{ ok: boolean }> {
    return this.http.put<{ ok: boolean }>(this.api('/menu/reorder'), items).pipe(
      tap(() => this.invalidarCache())
    );
  }

  getSnapshot(): MenuItem[] {
    return this.menuSubject.value;
  }

  getTopbar(): Observable<TopbarConfig> {
    return this.http.get<TopbarConfig>(this.api('/menu/topbar')).pipe(
      catchError(() => of(structuredClone(TOPBAR_DEFAULTS)))
    );
  }

  getTopbarPublic(): Observable<TopbarConfig> {
    return this.http.get<TopbarConfig>(`${environment.apiBaseUrl}/branding/topbar`).pipe(
      catchError(() => of(structuredClone(TOPBAR_DEFAULTS)))
    );
  }

  salvarTopbar(config: TopbarConfig): Observable<TopbarConfig> {
    return this.http.put<TopbarConfig>(this.api('/menu/topbar'), config);
  }

  uploadLogoImagem(logoId: string, file: File): Observable<TopbarLogoUploadResponse> {
    const form = new FormData();
    form.append('imagem', file);
    return this.http.post<TopbarLogoUploadResponse>(
      this.api(`/menu/topbar/logos/${encodeURIComponent(logoId)}/imagem`),
      form
    );
  }

  getHomeCarrossel(): Observable<HomeCarrosselConfig> {
    return this.http.get<HomeCarrosselConfig>(this.api('/menu/carrossel')).pipe(
      catchError(() => of(structuredClone(HOME_CARROSSEL_DEFAULTS)))
    );
  }

  salvarHomeCarrossel(config: HomeCarrosselConfig): Observable<HomeCarrosselConfig> {
    return this.http.put<HomeCarrosselConfig>(this.api('/menu/carrossel'), config);
  }

  uploadCarrosselImagem(file: File): Observable<HomeCarrosselUploadResponse> {
    const form = new FormData();
    form.append('imagem', file);
    return this.http.post<HomeCarrosselUploadResponse>(
      this.api('/menu/carrossel/upload'),
      form
    );
  }

  getHomeSistemas(): Observable<HomeSistemasConfig> {
    return this.http.get<HomeSistemasConfig>(this.api('/menu/sistemas')).pipe(
      catchError(() => of(structuredClone(HOME_SISTEMAS_DEFAULTS)))
    );
  }

  salvarHomeSistemas(config: HomeSistemasConfig): Observable<HomeSistemasConfig> {
    return this.http.put<HomeSistemasConfig>(this.api('/menu/sistemas'), config);
  }

  getHeaderChamado(): Observable<HeaderChamadoConfig> {
    return this.http.get<HeaderChamadoConfig>(this.api('/menu/header-chamado'));
  }

  salvarHeaderChamado(body: {
    label: string;
    url: string | null;
    ativo: boolean;
    abrir_nova_aba: boolean;
    tipo_destino: 'interna' | 'externa';
  }): Observable<HeaderChamadoConfig> {
    return this.http.put<HeaderChamadoConfig>(this.api('/menu/header-chamado'), body);
  }

  getLoginPublic(): Observable<LoginConfig> {
    return this.http.get<LoginConfig>(`${environment.apiBaseUrl}/branding/login`).pipe(
      catchError(() => of(structuredClone(LOGIN_DEFAULTS)))
    );
  }

  getLogin(): Observable<LoginConfig> {
    return this.http.get<LoginConfig>(this.api('/menu/login')).pipe(
      catchError(() => of(structuredClone(LOGIN_DEFAULTS)))
    );
  }

  salvarLogin(config: LoginConfig): Observable<LoginConfig> {
    return this.http.put<LoginConfig>(this.api('/menu/login'), config);
  }
}
