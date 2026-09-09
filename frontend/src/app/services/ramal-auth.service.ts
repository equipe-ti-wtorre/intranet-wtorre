import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  Observable,
  catchError,
  finalize,
  map,
  of,
  shareReplay,
  tap,
} from 'rxjs';
import { environment } from '../../environments/environment';
import { DiretorioResposta } from '../models/colaborador.model';
import { RamalLoginResposta, RamalPerfil, RamalUsuario } from '../models/ramal.model';

const CHAVE_ACCESS = 'ramal_wtorre_access';
const CHAVE_REFRESH = 'ramal_wtorre_refresh';
const CHAVE_USUARIO = 'ramal_wtorre_usuario';
const EXP_MARGIN_SEC = 60;

@Injectable({ providedIn: 'root' })
export class RamalAuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  private accessMemoria: string | null = null;
  private refreshMemoria: string | null = null;
  private refreshInFlight: Observable<{ accessToken: string; token: string } | null> | null = null;

  readonly usuario = signal<RamalUsuario | null>(null);
  readonly isAdmin = computed(() => this.usuario()?.perfil === 'ADMIN');

  constructor() {
    this.restaurarSessao();
  }

  private api(path: string): string {
    return `${environment.apiBaseUrl}/ramal${path}`;
  }

  getToken(): string | null {
    return this.accessMemoria ?? sessionStorage.getItem(CHAVE_ACCESS) ?? localStorage.getItem(CHAVE_ACCESS);
  }

  getRefreshToken(): string | null {
    return (
      this.refreshMemoria ??
      sessionStorage.getItem(CHAVE_REFRESH) ??
      localStorage.getItem(CHAVE_REFRESH)
    );
  }

  temSessao(): boolean {
    return !!(this.getToken() || this.getRefreshToken());
  }

  temAccessValido(): boolean {
    const token = this.getToken();
    if (!token) return false;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const exp = Number(payload.exp || 0);
      if (!exp) return true;
      return exp * 1000 > Date.now() + EXP_MARGIN_SEC * 1000;
    } catch {
      return false;
    }
  }

  login(username: string, senha: string): Observable<RamalLoginResposta> {
    return this.http
      .post<RamalLoginResposta>(this.api('/auth/login'), { username, senha })
      .pipe(tap((res) => this.persistirSessao(res)));
  }

  refresh(): Observable<{ accessToken: string; token: string } | null> {
    if (this.refreshInFlight) return this.refreshInFlight;

    const refreshToken = this.getRefreshToken();
    if (!refreshToken) {
      return of(null);
    }

    this.refreshInFlight = this.http
      .post<RamalLoginResposta>(this.api('/auth/refresh'), { refreshToken })
      .pipe(
        tap((res) => this.persistirSessao(res)),
        map((res) => ({ accessToken: res.accessToken, token: res.token })),
        catchError(() => {
          this.limparSessao();
          return of(null);
        }),
        finalize(() => {
          this.refreshInFlight = null;
        }),
        shareReplay(1)
      );

    return this.refreshInFlight;
  }

  ensureSession(): Observable<boolean> {
    if (this.temAccessValido()) return of(true);
    if (!this.getRefreshToken()) return of(false);
    return this.refresh().pipe(map((r) => !!r));
  }

  logout(): Observable<unknown> {
    const refreshToken = this.getRefreshToken();
    const token = this.getToken();
    const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
    return this.http.post(this.api('/auth/logout'), { refreshToken }, { headers }).pipe(
      catchError(() => of(null)),
      finalize(() => {
        this.limparSessao();
        void this.router.navigateByUrl('/ramal/login');
      })
    );
  }

  irParaLogin(): void {
    void this.router.navigateByUrl('/ramal/login');
  }

  limparSessao(): void {
    this.accessMemoria = null;
    this.refreshMemoria = null;
    this.usuario.set(null);
    [localStorage, sessionStorage].forEach((store) => {
      store.removeItem(CHAVE_ACCESS);
      store.removeItem(CHAVE_REFRESH);
      store.removeItem(CHAVE_USUARIO);
    });
  }

  getDiretorio(): Observable<DiretorioResposta> {
    return this.http.get<DiretorioResposta>(this.api('/diretorio'));
  }

  getDepartamentos(): Observable<string[]> {
    return this.http.get<string[]>(this.api('/departamentos'));
  }

  listUsuarios(): Observable<RamalUsuario[]> {
    return this.http.get<RamalUsuario[]>(this.api('/usuarios'));
  }

  createUsuario(body: {
    username: string;
    nome: string;
    senha: string;
    perfil: RamalPerfil;
  }): Observable<RamalUsuario> {
    return this.http.post<RamalUsuario>(this.api('/usuarios'), body);
  }

  updateUsuario(
    id: number,
    body: {
      username: string;
      nome: string;
      perfil: RamalPerfil;
      ativo: boolean;
    }
  ): Observable<RamalUsuario> {
    return this.http.put<RamalUsuario>(this.api(`/usuarios/${id}`), body);
  }

  alterarSenha(id: number, senha: string): Observable<RamalUsuario> {
    return this.http.patch<RamalUsuario>(this.api(`/usuarios/${id}/senha`), { senha });
  }

  excluirUsuario(id: number): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(this.api(`/usuarios/${id}`));
  }

  private persistirSessao(res: RamalLoginResposta): void {
    const access = res.accessToken || res.token;
    const refresh = res.refreshToken;
    const usuario = res.usuario || res.user;
    this.accessMemoria = access;
    this.refreshMemoria = refresh;
    this.usuario.set(usuario);
    sessionStorage.setItem(CHAVE_ACCESS, access);
    sessionStorage.setItem(CHAVE_REFRESH, refresh);
    sessionStorage.setItem(CHAVE_USUARIO, JSON.stringify(usuario));
    localStorage.removeItem(CHAVE_ACCESS);
    localStorage.removeItem(CHAVE_REFRESH);
    localStorage.removeItem(CHAVE_USUARIO);
  }

  private restaurarSessao(): void {
    const access =
      sessionStorage.getItem(CHAVE_ACCESS) ?? localStorage.getItem(CHAVE_ACCESS);
    const refresh =
      sessionStorage.getItem(CHAVE_REFRESH) ?? localStorage.getItem(CHAVE_REFRESH);
    const raw =
      sessionStorage.getItem(CHAVE_USUARIO) ?? localStorage.getItem(CHAVE_USUARIO);
    this.accessMemoria = access;
    this.refreshMemoria = refresh;
    if (raw) {
      try {
        this.usuario.set(JSON.parse(raw) as RamalUsuario);
      } catch {
        this.usuario.set(null);
      }
    }
  }
}

export function isRamalApiUrl(url: string): boolean {
  return url.includes('/api/v1/ramal');
}

export function isRamalAuthPublic(url: string): boolean {
  return url.includes('/ramal/auth/login') || url.includes('/ramal/auth/refresh');
}
