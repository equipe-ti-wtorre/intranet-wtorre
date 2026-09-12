import { HttpClient, HttpEvent } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  Pagina,
  PaginaPayload,
  PaginaPublicaResumo,
  UploadImagemResp,
} from '../models/pagina.model';

@Injectable({ providedIn: 'root' })
export class PaginasService {
  private readonly http = inject(HttpClient);

  private api(path: string): string {
    return `${environment.apiBaseUrl}${path}`;
  }

  listar(opts?: { status?: string; busca?: string }): Observable<Pagina[]> {
    const params: Record<string, string> = {};
    if (opts?.status) params['status'] = opts.status;
    if (opts?.busca) params['busca'] = opts.busca;
    return this.http.get<Pagina[]>(this.api('/paginas'), { params });
  }

  listarPublicadas(): Observable<PaginaPublicaResumo[]> {
    return this.http.get<PaginaPublicaResumo[]>(this.api('/paginas/publicadas'));
  }

  obter(id: number): Observable<Pagina> {
    return this.http.get<Pagina>(this.api(`/paginas/${id}`));
  }

  buscarPorSlug(slug: string): Observable<Pagina> {
    return this.http.get<Pagina>(this.api(`/paginas/slug/${encodeURIComponent(slug)}`));
  }

  criar(payload: PaginaPayload): Observable<Pagina> {
    return this.http.post<Pagina>(this.api('/paginas'), payload);
  }

  atualizar(id: number, payload: Partial<PaginaPayload>): Observable<Pagina> {
    return this.http.put<Pagina>(this.api(`/paginas/${id}`), payload);
  }

  remover(id: number): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(this.api(`/paginas/${id}`));
  }

  uploadImagem(file: File): Observable<HttpEvent<UploadImagemResp>> {
    const form = new FormData();
    form.append('imagem', file);
    return this.http.post<UploadImagemResp>(this.api('/paginas/upload-imagem'), form, {
      reportProgress: true,
      observe: 'events',
    });
  }
}
