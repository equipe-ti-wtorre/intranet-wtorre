import { HttpClient, HttpErrorResponse, HttpResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable, catchError, firstValueFrom, map, of, tap } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  AniversariantesResposta,
  Colaborador,
  ColaboradorAdmin,
  ColaboradoresAdminFiltros,
  ColaboradoresAdminFiltrosOpcoes,
  ColaboradoresAdminResposta,
  ColaboradoresImportAplicarResposta,
  ColaboradoresImportPreviewResposta,
  ColaboradorGraphUpdatePayload,
  ColaboradorGraphUpdateResposta,
  ColaboradoresStats,
  ColaboradoresSyncResumo,
  DiretorioResposta,
} from '../models/colaborador.model';

@Injectable({ providedIn: 'root' })
export class ColaboradoresService {
  private readonly http = inject(HttpClient);
  private cache: DiretorioResposta | null = null;
  private readonly cache$ = new BehaviorSubject<DiretorioResposta | null>(null);

  private api(path: string): string {
    return `${environment.apiBaseUrl}${path}`;
  }

  getDiretorio(force = false): Observable<DiretorioResposta> {
    if (this.cache && !force) {
      return new Observable((sub) => {
        sub.next(this.cache!);
        sub.complete();
      });
    }
    return this.http.get<DiretorioResposta>(this.api('/colaboradores')).pipe(
      tap((res) => {
        this.cache = res;
        this.cache$.next(res);
      })
    );
  }

  getDepartamentos(): Observable<string[]> {
    return this.http.get<string[]>(this.api('/colaboradores/departamentos'));
  }

  getAniversariantes(mes: number): Observable<AniversariantesResposta> {
    return this.http.get<AniversariantesResposta>(this.api('/aniversariantes'), {
      params: { mes: String(mes) },
    });
  }

  carregarFotoBlob(id: number): Observable<Blob | null> {
    return this.http
      .get(this.api(`/colaboradores/${id}/foto`), { responseType: 'blob', observe: 'response' })
      .pipe(
        map((res: HttpResponse<Blob>) =>
          res.status === 200 && res.body?.size ? res.body : null
        ),
        catchError(() => of(null))
      );
  }

  async fotoObjectUrl(id: number): Promise<string | null> {
    try {
      const blob = await firstValueFrom(this.carregarFotoBlob(id));
      if (!blob?.size) return null;
      const normalized = blob.type.startsWith('image/') ? blob : new Blob([blob], { type: 'image/jpeg' });
      return URL.createObjectURL(normalized);
    } catch {
      return null;
    }
  }

  sincronizar(): Observable<ColaboradoresSyncResumo> {
    return this.http.post<ColaboradoresSyncResumo>(this.api('/colaboradores/sync'), {}).pipe(
      tap(() => this.invalidarCache())
    );
  }

  listarAdmin(filtros: ColaboradoresAdminFiltros = {}): Observable<ColaboradoresAdminResposta> {
    const params: Record<string, string> = this.adminFiltrosParams(filtros);
    if (filtros.page) params['page'] = String(filtros.page);
    if (filtros.limit) params['limit'] = String(filtros.limit);
    return this.http.get<ColaboradoresAdminResposta>(this.api('/colaboradores/admin'), { params });
  }

  obterFiltrosAdmin(): Observable<ColaboradoresAdminFiltrosOpcoes> {
    return this.http.get<ColaboradoresAdminFiltrosOpcoes>(this.api('/colaboradores/admin/filtros'));
  }

  obterAdmin(id: number): Observable<ColaboradorAdmin> {
    return this.http.get<ColaboradorAdmin>(this.api(`/colaboradores/admin/${id}`));
  }

  atualizarGraph(
    id: number,
    body: ColaboradorGraphUpdatePayload
  ): Observable<ColaboradorGraphUpdateResposta> {
    return this.http.patch<ColaboradorGraphUpdateResposta>(this.api(`/colaboradores/admin/${id}`), body).pipe(
      tap(() => this.invalidarCache())
    );
  }

  obterStats(): Observable<ColaboradoresStats> {
    return this.http.get<ColaboradoresStats>(this.api('/colaboradores/admin/stats'));
  }

  private adminFiltrosParams(filtros: ColaboradoresAdminFiltros = {}): Record<string, string> {
    const params: Record<string, string> = {};
    if (filtros.busca?.trim()) params['busca'] = filtros.busca.trim();
    if (filtros.empresa?.trim()) params['empresa'] = filtros.empresa.trim();
    if (filtros.departamento?.trim()) params['departamento'] = filtros.departamento.trim();
    if (filtros.ativo) params['ativo'] = filtros.ativo;
    if (filtros.tenant_id) params['tenant_id'] = String(filtros.tenant_id);
    if (filtros.intranet) params['intranet'] = filtros.intranet;
    if (filtros.cargo) params['cargo'] = filtros.cargo;
    if (filtros.empresa_status) params['empresa_status'] = filtros.empresa_status;
    if (filtros.incompletos) params['incompletos'] = '1';
    return params;
  }

  exportarAdmin(filtros: ColaboradoresAdminFiltros = {}): Observable<Blob> {
    return this.http
      .get(this.api('/colaboradores/admin/export'), {
        params: this.adminFiltrosParams(filtros),
        responseType: 'blob',
        observe: 'response',
      })
      .pipe(
        map((res: HttpResponse<Blob>) => {
          const body = res.body;
          const contentType = (res.headers.get('Content-Type') || '').toLowerCase();
          if (
            !body?.size ||
            contentType.includes('application/json') ||
            contentType.includes('text/html')
          ) {
            throw new HttpErrorResponse({
              error: body,
              status: res.status,
              statusText: res.statusText,
              url: res.url || undefined,
            });
          }
          return body;
        })
      );
  }

  async mensagemErroHttp(err: HttpErrorResponse, fallback: string): Promise<string> {
    if (err.error instanceof Blob) {
      try {
        const text = await err.error.text();
        const parsed = JSON.parse(text) as { mensagem?: string };
        if (parsed.mensagem?.trim()) return parsed.mensagem;
      } catch {
        /* ignora */
      }
    } else if (typeof err.error?.mensagem === 'string' && err.error.mensagem.trim()) {
      return err.error.mensagem;
    }
    return fallback;
  }

  previewImport(arquivo: File): Observable<ColaboradoresImportPreviewResposta> {
    const form = new FormData();
    form.append('arquivo', arquivo, arquivo.name);
    return this.http.post<ColaboradoresImportPreviewResposta>(
      this.api('/colaboradores/admin/import/preview'),
      form
    );
  }

  aplicarImport(arquivo: File): Observable<ColaboradoresImportAplicarResposta> {
    const form = new FormData();
    form.append('arquivo', arquivo, arquivo.name);
    return this.http.post<ColaboradoresImportAplicarResposta>(
      this.api('/colaboradores/admin/import/aplicar'),
      form
    ).pipe(tap(() => this.invalidarCache()));
  }

  invalidarCache(): void {
    this.cache = null;
    this.cache$.next(null);
  }
}
