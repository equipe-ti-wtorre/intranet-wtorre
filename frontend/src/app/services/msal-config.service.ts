import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  PublicClientApplication,
  type AuthenticationResult,
  type Configuration,
} from '@azure/msal-browser';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { MsalConfigResposta } from '../models/usuario.model';

@Injectable({ providedIn: 'root' })
export class MsalConfigService {
  private readonly http = inject(HttpClient);

  private instance: PublicClientApplication | null = null;
  private redirectResult: AuthenticationResult | null = null;
  private loadError: string | null = null;
  private clientId = '';
  private _initPromise: Promise<void> | null = null;

  private redirectUriAtual(): string {
    if (typeof window === 'undefined') return '';
    return window.location.origin;
  }

  private resolveRedirectUri(config: MsalConfigResposta): string {
    const origin = this.redirectUriAtual();
    const allowed = config.redirectUris || [];
    if (!origin) return config.redirectUri || '';

    const normalizar = (uri: string) => uri.replace(/\/$/, '');
    const originNorm = normalizar(origin);

    const match = allowed.find((uri) => normalizar(uri) === originNorm);
    if (match) return normalizar(match);

    const matchLogin = allowed.find((uri) => normalizar(uri) === `${originNorm}/login`);
    if (matchLogin) return normalizar(matchLogin);

    return originNorm || config.redirectUri || '';
  }

  initialize(): Promise<void> {
    if (this._initPromise) return this._initPromise;
    this._initPromise = this._doInitialize();
    return this._initPromise;
  }

  private async _doInitialize(): Promise<void> {
    try {
      const config = await firstValueFrom(
        this.http.get<MsalConfigResposta>(`${environment.apiBaseUrl}/tenants/msal-config`)
      );
      this.clientId = config.clientId || '';
      const redirectUri = this.resolveRedirectUri(config);
      const msalConfig: Configuration = {
        auth: {
          clientId: this.clientId || '00000000-0000-0000-0000-000000000000',
          authority: config.authority || environment.msalAuthority,
          redirectUri,
        },
        cache: {
          cacheLocation: 'localStorage',
        },
      };
      this.instance = new PublicClientApplication(msalConfig);
      await this.instance.initialize();
      this.redirectResult = await this.instance.handleRedirectPromise();
      if (!this.clientId) {
        this.loadError = 'MSAL não configurado: cadastre um tenant principal no painel admin.';
      }
    } catch (err) {
      this.loadError =
        err instanceof Error ? err.message : 'Não foi possível carregar a configuração Microsoft.';
      const msalConfig: Configuration = {
        auth: {
          clientId: '00000000-0000-0000-0000-000000000000',
          authority: environment.msalAuthority,
          redirectUri: this.redirectUriAtual(),
        },
        cache: { cacheLocation: 'localStorage' },
      };
      this.instance = new PublicClientApplication(msalConfig);
      await this.instance.initialize();
      this.redirectResult = await this.instance.handleRedirectPromise();
    }
  }

  consumeRedirectResult(): AuthenticationResult | null {
    const result = this.redirectResult;
    this.redirectResult = null;
    return result;
  }

  getInstance(): PublicClientApplication | null {
    return this.instance;
  }

  hasClientId(): boolean {
    return !!this.clientId;
  }

  getLoadError(): string | null {
    return this.loadError;
  }
}

export function msalConfigInitializer(msalConfig: MsalConfigService) {
  return () => msalConfig.initialize();
}
