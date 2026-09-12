import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  Comunicado,
  ComunicadoAdmin,
  ComunicadoCategoriaPayload,
  ComunicadoCategoriaRecord,
  ComunicadoPayload,
} from '../models/comunicado.model';

@Injectable({ providedIn: 'root' })
export class ComunicadosService {
  private readonly http = inject(HttpClient);

  private api(path: string): string {
    return `${environment.apiBaseUrl}${path}`;
  }

  listar(): Observable<Comunicado[]> {
    return this.http.get<Comunicado[]>(this.api('/comunicados'));
  }

  listarAdmin(busca?: string): Observable<ComunicadoAdmin[]> {
    const params = busca?.trim() ? { busca: busca.trim() } : undefined;
    return this.http.get<ComunicadoAdmin[]>(this.api('/comunicados/admin'), { params });
  }

  obter(id: number): Observable<ComunicadoAdmin> {
    return this.http.get<ComunicadoAdmin>(this.api(`/comunicados/${id}`));
  }

  criar(payload: ComunicadoPayload): Observable<ComunicadoAdmin> {
    return this.http.post<ComunicadoAdmin>(this.api('/comunicados'), this.toComunicadoBody(payload));
  }

  atualizar(id: number, payload: ComunicadoPayload): Observable<ComunicadoAdmin> {
    return this.http.put<ComunicadoAdmin>(
      this.api(`/comunicados/${id}`),
      this.toComunicadoBody(payload)
    );
  }

  remover(id: number): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(this.api(`/comunicados/${id}`));
  }

  listarCategorias(): Observable<ComunicadoCategoriaRecord[]> {
    return this.http.get<ComunicadoCategoriaRecord[]>(this.api('/comunicados/categorias'));
  }

  listarCategoriasAdmin(): Observable<ComunicadoCategoriaRecord[]> {
    return this.http.get<ComunicadoCategoriaRecord[]>(this.api('/comunicados/categorias/admin'));
  }

  criarCategoria(payload: ComunicadoCategoriaPayload): Observable<ComunicadoCategoriaRecord> {
    return this.http.post<ComunicadoCategoriaRecord>(
      this.api('/comunicados/categorias'),
      payload
    );
  }

  atualizarCategoria(
    id: number,
    payload: ComunicadoCategoriaPayload
  ): Observable<ComunicadoCategoriaRecord> {
    return this.http.put<ComunicadoCategoriaRecord>(
      this.api(`/comunicados/categorias/${id}`),
      payload
    );
  }

  removerCategoria(id: number): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(this.api(`/comunicados/categorias/${id}`));
  }

  private toComunicadoBody(payload: ComunicadoPayload): Record<string, unknown> {
    return {
      titulo: payload.titulo,
      categoria_id: payload.categoriaId,
      data_publicacao: payload.dataPublicacao,
      ordem: payload.ordem ?? null,
      ativo: payload.ativo ?? true,
    };
  }
}
