import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  FollowupConfig,
  FollowupFilial,
  FollowupResumoItem,
  FollowupSolicitacao,
  FollowupStatusSync,
  FollowupSyncResumo,
  FollowupTesteConexao,
} from '../models/followup.model';

@Injectable({ providedIn: 'root' })
export class FollowupService {
  private readonly http = inject(HttpClient);

  private api(path: string): string {
    return `${environment.apiBaseUrl}/followup${path}`;
  }

  minhas(): Observable<FollowupSolicitacao[]> {
    return this.http.get<FollowupSolicitacao[]>(this.api('/minhas'));
  }

  resumo(): Observable<FollowupResumoItem[]> {
    return this.http.get<FollowupResumoItem[]>(this.api('/resumo'));
  }

  filiais(): Observable<FollowupFilial[]> {
    return this.http.get<FollowupFilial[]>(this.api('/filiais'));
  }

  porNumero(
    numero: number | string,
    escopo: 'rm' | 'documento' | 'todos' = 'todos'
  ): Observable<FollowupSolicitacao[]> {
    const params = escopo && escopo !== 'todos' ? { escopo } : undefined;
    return this.http.get<FollowupSolicitacao[]>(this.api(`/solicitacao/${numero}`), { params });
  }

  obterConfig(): Observable<FollowupConfig> {
    return this.http.get<FollowupConfig>(this.api('/config'));
  }

  salvarConfig(body: Partial<FollowupConfig>): Observable<FollowupConfig> {
    return this.http.put<FollowupConfig>(this.api('/config'), body);
  }

  testarConexao(): Observable<FollowupTesteConexao> {
    return this.http.post<FollowupTesteConexao>(this.api('/testar-conexao'), {});
  }

  sincronizar(): Observable<FollowupSyncResumo> {
    return this.http.post<FollowupSyncResumo>(this.api('/sincronizar'), {});
  }

  statusSync(): Observable<FollowupStatusSync> {
    return this.http.get<FollowupStatusSync>(this.api('/status-sync'));
  }
}
