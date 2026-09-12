import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  RustdeskCsvResultado,
  RustdeskDispositivo,
  RustdeskDispositivoPayload,
  RustdeskDispositivosLista,
  RustdeskMetricas,
  RustdeskOrfao,
  RustdeskResumo,
  RustdeskSyncLog,
  RustdeskSyncResultado,
} from '../models/rustdesk.model';

export interface RustdeskListaFiltros {
  busca?: string;
  entidade_id?: number | string;
  tipo?: string;
  ativo?: '1' | '0' | 'todos';
  page?: number;
  page_size?: number;
}

@Injectable({ providedIn: 'root' })
export class RustdeskService {
  private readonly http = inject(HttpClient);

  private api(path: string): string {
    return `${environment.apiBaseUrl}/rustdesk${path}`;
  }

  resumo(): Observable<RustdeskResumo> {
    return this.http.get<RustdeskResumo>(this.api('/resumo'));
  }

  metricas(): Observable<RustdeskMetricas> {
    return this.http.get<RustdeskMetricas>(this.api('/metricas'));
  }

  listarDispositivos(filtros: RustdeskListaFiltros = {}): Observable<RustdeskDispositivosLista> {
    let params = new HttpParams();
    if (filtros.busca) params = params.set('busca', filtros.busca);
    if (filtros.entidade_id != null && filtros.entidade_id !== '') {
      params = params.set('entidade_id', String(filtros.entidade_id));
    }
    if (filtros.tipo) params = params.set('tipo', filtros.tipo);
    if (filtros.ativo) params = params.set('ativo', filtros.ativo);
    if (filtros.page) params = params.set('page', String(filtros.page));
    if (filtros.page_size) params = params.set('page_size', String(filtros.page_size));
    return this.http.get<RustdeskDispositivosLista>(this.api('/dispositivos'), { params });
  }

  obterDispositivo(id: number): Observable<RustdeskDispositivo> {
    return this.http.get<RustdeskDispositivo>(this.api(`/dispositivos/${id}`));
  }

  criarDispositivo(body: RustdeskDispositivoPayload): Observable<RustdeskDispositivo> {
    return this.http.post<RustdeskDispositivo>(this.api('/dispositivos'), body);
  }

  atualizarDispositivo(id: number, body: RustdeskDispositivoPayload): Observable<RustdeskDispositivo> {
    return this.http.patch<RustdeskDispositivo>(this.api(`/dispositivos/${id}`), body);
  }

  excluirDispositivo(id: number): Observable<RustdeskDispositivo> {
    return this.http.delete<RustdeskDispositivo>(this.api(`/dispositivos/${id}`));
  }

  importarCsv(arquivo: File): Observable<RustdeskCsvResultado> {
    const fd = new FormData();
    fd.append('arquivo', arquivo);
    return this.http.post<RustdeskCsvResultado>(this.api('/dispositivos/csv'), fd);
  }

  listarOrfaos(): Observable<RustdeskOrfao[]> {
    return this.http.get<RustdeskOrfao[]>(this.api('/orfaos'));
  }

  vincularOrfao(rustdeskId: string, body: RustdeskDispositivoPayload): Observable<RustdeskDispositivo> {
    return this.http.post<RustdeskDispositivo>(
      this.api(`/orfaos/${encodeURIComponent(rustdeskId)}/vincular`),
      body
    );
  }

  sincronizar(): Observable<RustdeskSyncResultado> {
    return this.http.post<RustdeskSyncResultado>(this.api('/sincronizar'), {});
  }

  listarSyncLog(limit = 10): Observable<RustdeskSyncLog[]> {
    return this.http.get<RustdeskSyncLog[]>(this.api('/sync-log'), {
      params: { limit: String(limit) },
    });
  }

  baixarInstalador(): Observable<Blob> {
    return this.http.get(this.api('/instalador'), { responseType: 'blob' });
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
