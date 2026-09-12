import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  Observable,
  tap,
  catchError,
  of,
  throwError,
  firstValueFrom,
  map,
  finalize,
  shareReplay,
} from 'rxjs';
import { environment } from '../../environments/environment';
import { LoginResposta, Usuario } from '../models/usuario.model';
import { MsalConfigService } from './msal-config.service';
import { ADMIN_MODULO_ROTAS } from '../data/admin-modulos';

const CHAVE_ACCESS = 'intranet_wtorre_access';
const CHAVE_REFRESH = 'intranet_wtorre_refresh';
const CHAVE_USUARIO = 'intranet_wtorre_usuario';
const CHAVE_REDIRECT_FP = 'intranet_msal_redirect_fp';
const CHAVE_MSAL_LOGIN_ERRO = 'intranet_msal_login_erro';
const EXP_MARGIN_SEC = 60;

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly msalConfig = inject(MsalConfigService);

  private accessMemoria: string | null = null;
  private refreshMemoria: string | null = null;
  private refreshInFlight: Observable<{ accessToken: string; token: string } | null> | null = null;
  readonly usuario = signal<Usuario | null>(null);
  readonly modulos = signal<string[]>([]);
  readonly msalBusy = signal(false);

  constructor() {
    this.restaurarSessao();
  }

  private api(path: string): string {
    return `${environment.apiBaseUrl}${path}`;
  }

  private mapUsuario(u: Usuario): Usuario {
    const mapped = { ...u, nome: u.nome_completo };
    this.modulos.set(u.modulos ?? []);
    return mapped;
  }

  private decodeJwtPayload(token: string): { exp?: number } {
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('JWT inválido.');
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    return JSON.parse(atob(padded)) as { exp?: number };
  }

  private getPrimaryStorage(): Storage {
    if (localStorage.getItem(CHAVE_REFRESH) != null) return localStorage;
    if (sessionStorage.getItem(CHAVE_REFRESH) != null) return sessionStorage;
    if (localStorage.getItem(CHAVE_ACCESS) != null) return localStorage;
    return sessionStorage;
  }

  isAccessTokenExpirado(token?: string | null): boolean {
    const t = token ?? this.getToken();
    if (!t) return true;
    try {
      const payload = this.decodeJwtPayload(t);
      if (payload.exp == null) return false;
      const nowSec = Math.floor(Date.now() / 1000);
      return payload.exp <= nowSec + EXP_MARGIN_SEC;
    } catch {
      return true;
    }
  }

  temSessao(): boolean {
    return !!(this.getToken() || this.getRefreshToken());
  }

  /** Access token presente e dentro da validade (sem chamada HTTP). */
  temAccessValido(): boolean {
    const access = this.getToken();
    return !!access && !this.isAccessTokenExpirado(access);
  }

  /** Remove tokens inconsistentes ou corrompidos do storage local. */
  sanitizarSessaoArmazenada(): void {
    const access = localStorage.getItem(CHAVE_ACCESS) ?? sessionStorage.getItem(CHAVE_ACCESS);
    const refresh = localStorage.getItem(CHAVE_REFRESH) ?? sessionStorage.getItem(CHAVE_REFRESH);

    if (!access && !refresh) return;

    const jwtMalformado = (t: string) => t.split('.').length !== 3;
    if ((access && jwtMalformado(access)) || (refresh && jwtMalformado(refresh))) {
      this.limparSessao();
      return;
    }

    if (access && this.isAccessTokenExpirado(access) && !refresh) {
      this.limparSessao();
    }
  }

  /** Garante access token válido; tenta refresh silencioso quando necessário. */
  ensureSession(): Observable<boolean> {
    const access = this.getToken();
    if (access && !this.isAccessTokenExpirado(access)) {
      return of(true);
    }

    const refreshToken = this.getRefreshToken();
    if (!refreshToken) {
      if (access) this.limparSessao();
      return of(false);
    }

    return this.refresh().pipe(
      map((res) => !!(res && (res.accessToken || res.token)))
    );
  }

  loginLocal(email: string, senha: string, manterConectado = true): Observable<LoginResposta> {
    return this.http
      .post<LoginResposta>(this.api('/auth/login'), { email, senha })
      .pipe(tap((res) => this.persistirSessao(res, manterConectado)));
  }

  /** @deprecated use loginLocal */
  login(usuario: string, senha: string, manterConectado = true): Observable<LoginResposta> {
    return this.loginLocal(usuario, senha, manterConectado);
  }

  async loginMicrosoft(forceAccountPicker = false): Promise<void> {
    if (!this.msalConfig.hasClientId()) {
      throw new Error(this.msalConfig.getLoadError() || 'Microsoft SSO não configurado.');
    }
    const instance = this.msalConfig.getInstance();
    if (!instance) throw new Error('MSAL não inicializado.');

    const request: { scopes: string[]; prompt?: string } = {
      scopes: ['User.Read', 'openid', 'profile'],
    };
    if (forceAccountPicker) {
      request.prompt = 'select_account';
    }

    sessionStorage.removeItem('msal.interaction.status');
    this.msalBusy.set(true);
    try {
      await instance.loginRedirect(request);
    } catch (err: unknown) {
      this.msalBusy.set(false);
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('interaction_in_progress')) {
        // Limpa chaves de interação do MSAL em ambos os storages (MSAL v5 usa localStorage)
        ['localStorage', 'sessionStorage'].forEach((s) => {
          const store = window[s as 'localStorage' | 'sessionStorage'];
          Object.keys(store)
            .filter((k) => k.includes('interaction.status'))
            .forEach((k) => store.removeItem(k));
        });
        await instance.loginRedirect(request);
        return;
      }
      throw err;
    }
  }

  salvarErroLoginMicrosoft(err: unknown): void {
    const http = err as HttpErrorResponse;
    const msg =
      http.error?.mensagem ||
      (err instanceof Error ? err.message : null) ||
      'Falha no login Microsoft.';
    sessionStorage.setItem(CHAVE_MSAL_LOGIN_ERRO, msg);
  }

  consumirErroLoginMicrosoft(): string | null {
    const msg = sessionStorage.getItem(CHAVE_MSAL_LOGIN_ERRO);
    if (msg) sessionStorage.removeItem(CHAVE_MSAL_LOGIN_ERRO);
    return msg;
  }

  /** Remove tokens JWT inválidos sem deslogar da Microsoft (útil na tela de login). */
  limparSessaoJwt(): void {
    this.limparSessao();
  }

  irParaLogin(): void {
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      window.location.replace('/login');
      return;
    }
    void this.router.navigate(['/login'], { replaceUrl: true });
  }

  handleRedirect(): Observable<LoginResposta | null> {
    const result = this.msalConfig.consumeRedirectResult();
    if (!result?.idToken) return of(null);

    const fp = result.idToken.slice(0, 32);
    if (sessionStorage.getItem(CHAVE_REDIRECT_FP) === fp) {
      return of(null);
    }
    sessionStorage.setItem(CHAVE_REDIRECT_FP, fp);

    if (typeof window !== 'undefined' && window.location.hash) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }

    return this.http.post<LoginResposta>(
      this.api('/auth/login-microsoft'),
      {},
      { headers: new HttpHeaders({ Authorization: `Bearer ${result.idToken}` }) }
    ).pipe(
      tap((res) => this.persistirSessao(res, true)),
      catchError((err) => {
        sessionStorage.removeItem(CHAVE_REDIRECT_FP);
        return throwError(() => err);
      })
    );
  }

  irParaInicio(): void {
    this.completarLogin();
  }

  /** Navega para /inicio após login (router primeiro; reload só se necessário). */
  completarLogin(): void {
    if (!this.temSessao()) return;

    const navegar = (): void => {
      void this.router.navigateByUrl('/inicio', { replaceUrl: true }).then((ok) => {
        if (!ok && typeof window !== 'undefined') {
          window.location.assign('/inicio');
        }
      });
    };

    if (this.temAccessValido()) {
      navegar();
      return;
    }

    void firstValueFrom(this.ensureSession().pipe(catchError(() => of(false)))).then((ok) => {
      if (ok || this.temAccessValido()) navegar();
    });
  }

  refresh(): Observable<{ accessToken: string; token: string } | null> {
    if (this.refreshInFlight) {
      return this.refreshInFlight;
    }

    const refreshToken = this.getRefreshToken();
    if (!refreshToken) return of(null);

    this.refreshInFlight = this.http
      .post<{ accessToken: string; token: string }>(this.api('/auth/refresh'), { refreshToken })
      .pipe(
        tap((res) => {
          if (this.getRefreshToken() !== refreshToken) return;
          const accessToken = res.accessToken || res.token;
          this.accessMemoria = accessToken;
          const storage = this.getPrimaryStorage();
          storage.setItem(CHAVE_ACCESS, accessToken);
        }),
        catchError((err: HttpErrorResponse) => {
          if (err.status === 401 && this.getRefreshToken() === refreshToken) {
            this.limparSessao();
          }
          return of(null);
        }),
        finalize(() => {
          this.refreshInFlight = null;
        }),
        shareReplay(1)
      );

    return this.refreshInFlight;
  }

  limparSessao(): void {
    this.accessMemoria = null;
    this.refreshMemoria = null;
    this.usuario.set(null);
    this.modulos.set([]);
    localStorage.removeItem(CHAVE_ACCESS);
    localStorage.removeItem(CHAVE_REFRESH);
    localStorage.removeItem(CHAVE_USUARIO);
    sessionStorage.removeItem(CHAVE_ACCESS);
    sessionStorage.removeItem(CHAVE_REFRESH);
    sessionStorage.removeItem(CHAVE_USUARIO);
    sessionStorage.removeItem(CHAVE_REDIRECT_FP);
  }

  logout(navigate = true, msalLogout = true): void {
    const refreshToken = this.getRefreshToken();
    if (refreshToken) {
      this.http.post(this.api('/auth/logout'), { refreshToken }).subscribe();
    }

    const instance = this.msalConfig.getInstance();
    if (instance) {
      const accounts = instance.getAllAccounts();
      if (msalLogout && accounts.length) {
        void instance.logoutRedirect({ account: accounts[0] }).catch(() => {
          instance.clearCache();
        });
      } else {
        instance.clearCache();
      }
    }

    this.limparSessao();

    if (navigate) {
      if (typeof window !== 'undefined') {
        window.location.replace('/login');
      } else {
        void this.router.navigate(['/login']);
      }
    }
  }

  estaLogado(): boolean {
    return !!this.getToken();
  }

  getToken(): string | null {
    if (this.accessMemoria) return this.accessMemoria;
    return localStorage.getItem(CHAVE_ACCESS) ?? sessionStorage.getItem(CHAVE_ACCESS);
  }

  getRefreshToken(): string | null {
    if (this.refreshMemoria) return this.refreshMemoria;
    return localStorage.getItem(CHAVE_REFRESH) ?? sessionStorage.getItem(CHAVE_REFRESH);
  }

  carregarPerfil(): Observable<Usuario | null> {
    if (!this.temSessao()) return of(null);
    return this.http.get<Usuario>(this.api('/auth/me')).pipe(
      tap((u) => {
        const mapped = this.mapUsuario(u);
        this.usuario.set(mapped);
        const storage = this.getPrimaryStorage();
        storage.setItem(CHAVE_USUARIO, JSON.stringify({ ...mapped, modulos: this.modulos() }));
      }),
      catchError(() => of(null))
    );
  }

  getProfilePhotoUrl(): string {
    return this.api('/auth/profile-photo');
  }

  getPrimeiroNome(): string {
    const nome = this.usuario()?.nome_completo ?? this.usuario()?.nome ?? '';
    return nome.split(' ')[0] || 'Colaborador';
  }

  getIniciais(): string {
    const nome = this.usuario()?.nome_completo ?? this.usuario()?.nome ?? '';
    const partes = nome.trim().split(/\s+/);
    if (partes.length >= 2) {
      return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
    }
    return nome.slice(0, 2).toUpperCase() || '??';
  }

  isAdmin(): boolean {
    return this.usuario()?.perfil === 'ADMIN';
  }

  hasModulo(codigo: string): boolean {
    return this.isAdmin() || this.modulos().includes(codigo);
  }

  temAcessoAdmin(): boolean {
    if (this.isAdmin()) return true;
    const mods = this.modulos();
    return ADMIN_MODULO_ROTAS.some(({ codigo }) => mods.includes(codigo));
  }

  primeiraRotaAdmin(): string | null {
    if (this.isAdmin()) {
      return 'menu';
    }
    const mods = this.modulos();
    for (const { codigo, rota } of ADMIN_MODULO_ROTAS) {
      if (mods.includes(codigo)) {
        if (codigo === 'rodape' || codigo === 'comunicados') {
          return 'menu';
        }
        if (codigo === 'treinamentos') {
          return 'documentos';
        }
        return rota;
      }
    }
    return null;
  }

  private persistirSessao(res: LoginResposta, manterConectado: boolean): void {
    this.refreshInFlight = null;

    const raw = res.usuario ?? res.user;
    if (!raw) {
      throw new Error('Resposta de login sem dados do utilizador.');
    }
    const accessToken = res.accessToken || res.token;
    const refreshToken = res.refreshToken;
    if (!accessToken || !refreshToken) {
      throw new Error('Resposta de login sem tokens.');
    }

    const user = this.mapUsuario(raw);
    this.accessMemoria = accessToken;
    this.refreshMemoria = refreshToken;
    this.usuario.set(user);

    const storage = manterConectado ? localStorage : sessionStorage;
    storage.setItem(CHAVE_ACCESS, accessToken);
    storage.setItem(CHAVE_REFRESH, refreshToken);
    storage.setItem(CHAVE_USUARIO, JSON.stringify({ ...user, modulos: this.modulos() }));

    const other = manterConectado ? sessionStorage : localStorage;
    other.removeItem(CHAVE_ACCESS);
    other.removeItem(CHAVE_REFRESH);
    other.removeItem(CHAVE_USUARIO);
  }

  private restaurarSessao(): void {
    const access =
      localStorage.getItem(CHAVE_ACCESS) ?? sessionStorage.getItem(CHAVE_ACCESS);
    const refresh =
      localStorage.getItem(CHAVE_REFRESH) ?? sessionStorage.getItem(CHAVE_REFRESH);
    const usuarioJson =
      localStorage.getItem(CHAVE_USUARIO) ?? sessionStorage.getItem(CHAVE_USUARIO);

    if (access) this.accessMemoria = access;
    if (refresh) this.refreshMemoria = refresh;
    if (usuarioJson) {
      try {
        const u = JSON.parse(usuarioJson) as Usuario;
        this.usuario.set(this.mapUsuario(u));
        if (access && (!u.modulos || u.modulos.length === 0) && u.perfil !== 'ADMIN') {
          void firstValueFrom(this.carregarPerfil()).catch(() => null);
        }
      } catch {
        /* ignora */
      }
    } else if (access) {
      void firstValueFrom(this.carregarPerfil()).catch(() => null);
    }
  }
}

export function authSessionInitializer(auth: AuthService) {
  return () => {
    auth.sanitizarSessaoArmazenada();
    return firstValueFrom(auth.ensureSession()).catch(() => false);
  };
}

export function authMsalRedirectInitializer(auth: AuthService, msalConfig: MsalConfigService) {
  return () =>
    // Garante que o MSAL esteja inicializado antes de ler o redirect result
    msalConfig.initialize().then(() =>
      firstValueFrom(auth.handleRedirect())
        .then((res) => {
          if (res) void auth.completarLogin();
          return res;
        })
        .catch((err) => {
          auth.salvarErroLoginMicrosoft(err);
          if (
            typeof window !== 'undefined' &&
            !window.location.pathname.startsWith('/login')
          ) {
            auth.irParaLogin();
          }
          return null;
        })
    );
}
