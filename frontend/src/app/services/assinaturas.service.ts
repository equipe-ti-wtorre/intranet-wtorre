import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, from, switchMap, throwError } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  AssinaturaPerfil,
  GerarScriptPayload,
} from '../models/assinatura.model';
import { MsalConfigService } from './msal-config.service';

@Injectable({ providedIn: 'root' })
export class AssinaturasService {
  private readonly http = inject(HttpClient);
  private readonly msalConfig = inject(MsalConfigService);

  private api(path: string): string {
    return `${environment.apiBaseUrl}${path}`;
  }

  async acquireGraphToken(): Promise<string> {
    const instance = this.msalConfig.getInstance();
    if (!instance) {
      throw new Error('MSAL não inicializado. Faça login com Microsoft.');
    }

    const accounts = instance.getAllAccounts();
    if (!accounts.length) {
      throw new Error('Sessão Microsoft não encontrada. Faça login com Microsoft.');
    }

    const account = accounts[0];
    try {
      const result = await instance.acquireTokenSilent({
        scopes: ['User.Read'],
        account,
      });
      if (!result.accessToken) {
        throw new Error('Token Microsoft não obtido.');
      }
      return result.accessToken;
    } catch {
      await instance.acquireTokenRedirect({
        scopes: ['User.Read'],
        account,
      });
      throw new Error('Redirecionando para autenticação Microsoft…');
    }
  }

  carregarMe(): Observable<AssinaturaPerfil> {
    return from(this.acquireGraphToken()).pipe(
      switchMap((token) =>
        this.http.get<AssinaturaPerfil>(this.api('/assinaturas/me'), {
          headers: new HttpHeaders({ Authorization: `Bearer ${token}` }),
        })
      )
    );
  }

  gerarScript(payload: GerarScriptPayload): Observable<Blob> {
    return this.http.post(this.api('/assinaturas/gerar-script'), payload, {
      responseType: 'blob',
    });
  }

  downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
}
