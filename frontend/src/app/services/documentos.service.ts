import { HttpClient, HttpEvent, HttpEventType, HttpResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  CategoriaDocumento,
  CategoriaDocumentoPayload,
  CategoriaLegacyResolve,
  CategoriaReorderItem,
  Documento,
  DocumentoPagina,
  DocumentoPaginaPayload,
  DocumentoPaginaLogoUploadResponse,
  DocumentoSetor,
  DocumentoSetorPayload,
  DocumentoUpdatePayload,
} from '../models/documento.model';

@Injectable({ providedIn: 'root' })
export class DocumentosService {
  private readonly http = inject(HttpClient);

  private api(path: string): string {
    return `${environment.apiBaseUrl}${path}`;
  }

  listarPaginas(): Observable<DocumentoPagina[]> {
    return this.http.get<DocumentoPagina[]>(this.api('/documentos/paginas'));
  }

  listarPaginasAdmin(): Observable<DocumentoPagina[]> {
    return this.http.get<DocumentoPagina[]>(this.api('/documentos/paginas/admin'));
  }

  criarPagina(payload: DocumentoPaginaPayload): Observable<DocumentoPagina> {
    return this.http.post<DocumentoPagina>(this.api('/documentos/paginas/admin'), payload);
  }

  atualizarPagina(id: number, payload: DocumentoPaginaPayload): Observable<DocumentoPagina> {
    return this.http.put<DocumentoPagina>(this.api(`/documentos/paginas/admin/${id}`), payload);
  }

  removerPagina(id: number): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(this.api(`/documentos/paginas/admin/${id}`));
  }

  uploadPaginaLogo(file: File): Observable<DocumentoPaginaLogoUploadResponse> {
    const form = new FormData();
    form.append('imagem', file);
    return this.http.post<DocumentoPaginaLogoUploadResponse>(
      this.api('/documentos/paginas/admin/upload-logo'),
      form
    );
  }

  listarSetores(): Observable<DocumentoSetor[]> {
    return this.http.get<DocumentoSetor[]>(this.api('/documentos/setores'));
  }

  listarSetoresAdmin(): Observable<DocumentoSetor[]> {
    return this.http.get<DocumentoSetor[]>(this.api('/documentos/setores/admin'));
  }

  criarSetor(payload: DocumentoSetorPayload): Observable<DocumentoSetor> {
    return this.http.post<DocumentoSetor>(this.api('/documentos/setores/admin'), payload);
  }

  atualizarSetor(id: number, payload: DocumentoSetorPayload): Observable<DocumentoSetor> {
    return this.http.put<DocumentoSetor>(this.api(`/documentos/setores/admin/${id}`), payload);
  }

  removerSetor(id: number): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(this.api(`/documentos/setores/admin/${id}`));
  }

  listarCategorias(): Observable<CategoriaDocumento[]> {
    return this.http.get<CategoriaDocumento[]>(this.api('/doc-categorias'));
  }

  listarCategoriasPorPagina(paginaSlug: string): Observable<CategoriaDocumento[]> {
    return this.http.get<CategoriaDocumento[]>(this.api(`/doc-categorias/por-pagina/${paginaSlug}`));
  }

  listarCategoriasAdmin(paginaId: number): Observable<CategoriaDocumento[]> {
    return this.http.get<CategoriaDocumento[]>(this.api('/doc-categorias/admin'), {
      params: { pagina_id: String(paginaId) },
    });
  }

  resolverSlugLegado(slug: string): Observable<CategoriaLegacyResolve> {
    return this.http.get<CategoriaLegacyResolve>(this.api(`/doc-categorias/resolve/${slug}`));
  }

  listarDocumentos(
    categoriaIdOrSlug: string | number,
    setor?: string | null,
    paginaSlug?: string | null
  ): Observable<Documento[]> {
    const params: Record<string, string> = { categoria: String(categoriaIdOrSlug) };
    if (paginaSlug) {
      params['pagina'] = paginaSlug;
    }
    if (setor) {
      params['setor'] = setor;
    }
    return this.http.get<Documento[]>(this.api('/documentos'), { params });
  }

  urlView(id: number): string {
    return this.api(`/documentos/${id}/view`);
  }

  urlDownload(id: number): string {
    return this.api(`/documentos/${id}/download`);
  }

  visualizar(id: number): Observable<Blob> {
    return this.http.get(this.urlView(id), { responseType: 'blob' });
  }

  baixar(id: number): Observable<Blob> {
    return this.http.get(this.urlDownload(id), { responseType: 'blob' });
  }

  criarCategoria(payload: CategoriaDocumentoPayload): Observable<CategoriaDocumento> {
    return this.http.post<CategoriaDocumento>(this.api('/doc-categorias'), payload);
  }

  atualizarCategoria(id: number, payload: CategoriaDocumentoPayload): Observable<CategoriaDocumento> {
    return this.http.put<CategoriaDocumento>(this.api(`/doc-categorias/${id}`), payload);
  }

  removerCategoria(id: number): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(this.api(`/doc-categorias/${id}`));
  }

  reordenarCategorias(items: CategoriaReorderItem[]): Observable<{ ok: boolean }> {
    return this.http.put<{ ok: boolean }>(this.api('/doc-categorias/reorder'), items);
  }

  uploadDocumento(formData: FormData): Observable<HttpEvent<Documento>> {
    return this.http.post<Documento>(this.api('/documentos'), formData, {
      reportProgress: true,
      observe: 'events',
    });
  }

  atualizarDocumento(id: number, payload: DocumentoUpdatePayload): Observable<Documento> {
    return this.http.put<Documento>(this.api(`/documentos/${id}`), payload);
  }

  atualizarDocumentoFormData(id: number, formData: FormData): Observable<HttpEvent<Documento>> {
    return this.http.put<Documento>(this.api(`/documentos/${id}`), formData, {
      reportProgress: true,
      observe: 'events',
    });
  }

  carregarThumbnailPorId(id: number): Observable<Blob | null> {
    return this.http
      .get(this.api(`/documentos/${id}/thumb/stream`), {
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

  carregarThumbnail(url: string): Observable<Blob | null> {
    const path = this.resolveThumbnailPath(url);
    return this.http
      .get(path, {
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

  private resolveThumbnailPath(url: string): string {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      try {
        return new URL(url).pathname;
      } catch {
        return url;
      }
    }
    if (url.startsWith('/api/')) return url;
    return this.api(url.startsWith('/') ? url : `/${url}`);
  }

  removerDocumento(id: number): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(this.api(`/documentos/${id}`));
  }

  downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  isUploadProgress(event: HttpEvent<unknown>): event is HttpEvent<Documento> & { type: typeof HttpEventType.UploadProgress } {
    return event.type === HttpEventType.UploadProgress;
  }
}
