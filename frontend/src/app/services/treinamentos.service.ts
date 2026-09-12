import { HttpClient, HttpEvent, HttpParams, HttpResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  PlaybackResp,
  Treinamento,
  TreinamentoAdmin,
  TreinamentoDetalhe,
} from '../models/treinamento.model';
import { mapTreinamentoApi } from '../utils/treinamento-categoria.util';

@Injectable({ providedIn: 'root' })
export class TreinamentosService {
  private readonly http = inject(HttpClient);

  private api(path: string): string {
    return `${environment.apiBaseUrl}${path}`;
  }

  listar(
    paginaSlug: string,
    opts?: { categoriaSlug?: string | null; semCategoria?: boolean; setor?: string | null }
  ): Observable<Treinamento[]> {
    let params = new HttpParams().set('pagina', paginaSlug);
    if (opts?.semCategoria) {
      params = params.set('sem_categoria', '1');
    } else if (opts?.categoriaSlug) {
      params = params.set('categoria', opts.categoriaSlug);
    }
    if (opts?.setor) {
      params = params.set('setor', opts.setor);
    }
    return this.http
      .get<Record<string, unknown>[]>(this.api('/treinamentos'), { params })
      .pipe(map((rows) => rows.map(mapTreinamentoApi)));
  }

  listarAdmin(paginaId?: number | null): Observable<TreinamentoAdmin[]> {
    let params = new HttpParams();
    if (paginaId != null) {
      params = params.set('pagina_id', String(paginaId));
    }
    return this.http.get<TreinamentoAdmin[]>(this.api('/treinamentos/admin'), { params }).pipe(
      map((rows) =>
        rows.map((r) => ({
          ...mapTreinamentoApi(r as unknown as Record<string, unknown>),
          container: r.container,
          ativo: r.ativo,
          ordem: r.ordem,
          criado_em: r.criado_em,
          atualizado_em: r.atualizado_em,
          visibilidades: r.visibilidades ?? [],
        }))
      )
    );
  }

  obter(id: number): Observable<TreinamentoDetalhe> {
    return this.http.get<TreinamentoDetalhe>(this.api(`/treinamentos/${id}`));
  }

  playback(id: number): Observable<PlaybackResp> {
    return this.http.get<PlaybackResp>(this.api(`/treinamentos/${id}/playback`));
  }

  thumbUrl(id: number): Observable<PlaybackResp> {
    return this.http.get<PlaybackResp>(this.api(`/treinamentos/${id}/thumb`));
  }

  carregarThumb(id: number): Observable<Blob | null> {
    return this.http
      .get(this.api(`/treinamentos/${id}/thumb/stream`), {
        responseType: 'blob',
        observe: 'response',
      })
      .pipe(
        map((res: HttpResponse<Blob>) => {
          const body = res.body;
          if (res.status !== 200 || !body?.size) return null;
          const ct = (res.headers.get('Content-Type') || '').split(';')[0].trim();
          if (ct.includes('application/json')) return null;
          const type = ct.startsWith('image/') ? ct : 'image/jpeg';
          return body.type ? body : new Blob([body], { type });
        }),
        catchError(() => of(null))
      );
  }

  criar(formData: FormData): Observable<HttpEvent<TreinamentoDetalhe>> {
    return this.http.post<TreinamentoDetalhe>(this.api('/treinamentos'), formData, {
      reportProgress: true,
      observe: 'events',
    });
  }

  atualizar(id: number, formData: FormData): Observable<HttpEvent<TreinamentoDetalhe>> {
    return this.http.put<TreinamentoDetalhe>(this.api(`/treinamentos/${id}`), formData, {
      reportProgress: true,
      observe: 'events',
    });
  }

  remover(id: number): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(this.api(`/treinamentos/${id}`));
  }
}
