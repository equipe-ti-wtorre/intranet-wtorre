import { Injectable, computed, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, finalize, from, map, of, share, switchMap, tap, throwError } from 'rxjs';
import { PublicClientApplication } from '@azure/msal-browser';
import { environment } from '../environments/environment';
import { Session, User } from './models';

export interface MicrosoftTenant {
  nome: string;
  tenantId: string;
  clientId: string;
  hasSecret?: boolean;
  principal?: boolean;
}

export interface MicrosoftConfig {
  enabled: boolean;
  directory?: boolean;
  clientId: string;
  tenantId: string;
  redirectUri: string;
  tenants?: MicrosoftTenant[];
}

const TOKEN = 'taskhub_token';
const REFRESH = 'taskhub_refresh';
const USER = 'taskhub_user';
const MSAL_TID = 'taskhub_msal_tid';
const MSAL_AUTHORITY = 'https://login.microsoftonline.com/common';

function read<T>(key: string): T | null {
  try { const v = sessionStorage.getItem(key); return v ? JSON.parse(v) : null; } catch { return null; }
}
function dropAuthKeys() {
  [TOKEN, REFRESH, USER].forEach(k => {
    try { sessionStorage.removeItem(k); } catch { /* sessão privada */ }
    try { localStorage.removeItem(k); } catch { /* sessão privada */ }
  });
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private _token = signal<string | null>(read<string>(TOKEN));
  private _user = signal<User | null>(read<User>(USER));
  private refreshing$: Observable<string> | null = null;
  private msalApp: PublicClientApplication | null = null;
  private msalReady: Promise<PublicClientApplication> | null = null;

  readonly token = this._token.asReadonly();
  readonly user = this._user.asReadonly();
  readonly isLoggedIn = computed(() => !!this._token());
  readonly isAdmin = computed(() => !!this._user()?.profiles?.includes('admin'));
  readonly canManageUsers = computed(() => this._user()?.can_manage_users ?? null);

  constructor(private http: HttpClient, private router: Router) {
    // Limpa chaves da versão 1.x e sessão antiga no localStorage (agora a sessão vive na aba).
    ['taskhub_token_v1', 'devhub_token', 'devhub_user', 'planner_workspace_id', TOKEN, REFRESH, USER]
      .forEach(k => { try { localStorage.removeItem(k); } catch { /* sessão privada */ } });
    if (this._token()) this.loadMe().subscribe({ error: () => {} });
  }

  private store(s: Session) {
    sessionStorage.setItem(TOKEN, JSON.stringify(s.token));
    sessionStorage.setItem(REFRESH, JSON.stringify(s.refresh_token));
    sessionStorage.setItem(USER, JSON.stringify(s.user));
    this._token.set(s.token);
    this._user.set(s.user);
  }

  setUser(u: User) {
    sessionStorage.setItem(USER, JSON.stringify(u));
    this._user.set(u);
  }

  login(login: string, password: string) {
    return this.http.post<Session>(`${environment.apiUrl}/auth/login`, { login, password }).pipe(tap(s => this.store(s)));
  }

  microsoftConfig() {
    return this.http.get<MicrosoftConfig>(`${environment.apiUrl}/auth/microsoft/config`);
  }

  /** Conclui o retorno do redirect da Microsoft, se houver. Sem config, não faz nada. */
  completeMicrosoftLogin(): Observable<Session | null> {
    return this.microsoftConfig().pipe(
      switchMap(cfg => {
        const clientId = this.principalClientId(cfg);
        if (!cfg.enabled || !clientId) return of(null);
        return from(this.prepareMsal(clientId)).pipe(
          switchMap(app => from(app.handleRedirectPromise())),
          switchMap(result => {
            if (!result?.idToken) return of(null);
            this.clearMicrosoftAttempts();
            return this.http.post<Session>(`${environment.apiUrl}/auth/microsoft`, { id_token: result.idToken }).pipe(
              tap(s => this.store(s)),
            );
          }),
        );
      }),
    );
  }

  loginWithMicrosoft() {
    return this.microsoftConfig().pipe(
      switchMap(cfg => {
        const clientId = this.principalClientId(cfg);
        if (!cfg.enabled || !clientId) {
          return throwError(() => ({ error: { message: 'Login Microsoft não está configurado neste ambiente.' } }));
        }
        try { sessionStorage.setItem(MSAL_TID, 'common'); } catch { /* sessão privada */ }
        return from(this.prepareMsal(clientId)).pipe(
          switchMap(app => from(this.startMicrosoftRedirect(app))),
        );
      }),
    );
  }

  /** O MSAL da intranet usa a mesma trava de interação. Sem limpar, o redirect do TaskHub recusa na hora. */
  private async startMicrosoftRedirect(app: PublicClientApplication) {
    const request = { scopes: ['openid', 'profile', 'email'], prompt: 'select_account' as const };
    this.clearStaleMsalInteraction();
    try {
      await app.loginRedirect(request);
    } catch (err) {
      if (!this.isInteractionInProgress(err)) throw this.asUiError(err);
      this.clearStaleMsalInteraction();
      try {
        await app.loginRedirect(request);
      } catch (retryErr) {
        throw this.asUiError(retryErr);
      }
    }
  }

  private isInteractionInProgress(err: unknown): boolean {
    const e = err as { errorCode?: string; message?: string; errorMessage?: string };
    return `${e?.errorCode || ''} ${e?.message || ''} ${e?.errorMessage || ''}`.includes('interaction_in_progress');
  }

  private asUiError(err: unknown) {
    const e = err as { error?: { message?: string }; errorMessage?: string; message?: string };
    const message = e?.error?.message || e?.errorMessage || e?.message || 'Não foi possível abrir o login da Microsoft.';
    return { error: { message } };
  }

  private clearStaleMsalInteraction() {
    try {
      (['localStorage', 'sessionStorage'] as const).forEach(name => {
        const store = window[name];
        const keys: string[] = [];
        for (let i = 0; i < store.length; i++) {
          const key = store.key(i);
          if (key && key.includes('interaction.status')) keys.push(key);
        }
        keys.forEach(key => store.removeItem(key));
      });
    } catch { /* sessão privada */ }
  }

  private clearMicrosoftAttempts() {
    try { sessionStorage.removeItem(MSAL_TID); } catch { /* sessão privada */ }
  }

  private principalClientId(cfg: MicrosoftConfig): string {
    const list = cfg.tenants || [];
    return (list.find(t => t.principal) || list[0])?.clientId || cfg.clientId || '';
  }

  private prepareMsal(clientId: string) {
    if (!this.msalReady) {
      this.msalReady = (async () => {
        const app = new PublicClientApplication({
          auth: {
            clientId,
            authority: MSAL_AUTHORITY,
            redirectUri: window.location.origin,
          },
          cache: { cacheLocation: 'sessionStorage' },
        });
        await app.initialize();
        this.msalApp = app;
        return app;
      })().catch(err => {
        this.msalReady = null;
        throw err;
      });
    }
    return this.msalReady;
  }

  private clearMsalCache() {
    this.msalApp = null;
    this.msalReady = null;
    this.clearMicrosoftAttempts();
    try {
      const keys: string[] = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key && key.toLowerCase().startsWith('msal')) keys.push(key);
      }
      keys.forEach(key => sessionStorage.removeItem(key));
    } catch { /* sessão privada pode bloquear o storage */ }
  }

  loadMe() {
    return this.http.get<User>(`${environment.apiUrl}/auth/me`).pipe(tap(u => this.setUser(u)));
  }

  changePassword(current_password: string, new_password: string) {
    return this.http.post<Session>(`${environment.apiUrl}/auth/change-password`, { current_password, new_password })
      .pipe(tap(s => this.store(s)));
  }

  // Um único refresh por vez; requisições simultâneas esperam o mesmo resultado.
  refresh(): Observable<string> {
    if (!this.refreshing$) {
      const refresh_token = read<string>(REFRESH);
      this.refreshing$ = this.http.post<Session>(`${environment.apiUrl}/auth/refresh`, { refresh_token }).pipe(
        tap(s => this.store(s)),
        map(s => s.token),
        finalize(() => (this.refreshing$ = null)),
        share(),
      );
    }
    return this.refreshing$;
  }

  logoutAll() {
    return this.http.post(`${environment.apiUrl}/auth/logout-all`, {}).pipe(tap(() => this.clear()));
  }

  logout() {
    const refresh_token = read<string>(REFRESH);
    if (refresh_token) this.http.post(`${environment.apiUrl}/auth/logout`, { refresh_token }).subscribe({ error: () => {} });
    const app = this.msalApp;
    const account = app?.getAllAccounts()[0];
    dropAuthKeys();
    this._token.set(null);
    this._user.set(null);
    if (app && account) {
      app.logoutRedirect({ account, postLogoutRedirectUri: `${location.origin}/ti/taskhub/entrar` }).catch(() => {
        this.clearMsalCache();
        this.router.navigate(['/ti/taskhub/entrar']);
      });
      return;
    }
    this.clearMsalCache();
    this.router.navigate(['/ti/taskhub/entrar']);
  }

  clear() {
    dropAuthKeys();
    this.clearMsalCache();
    this._token.set(null);
    this._user.set(null);
    this.router.navigate(['/ti/taskhub/entrar']);
  }
}
