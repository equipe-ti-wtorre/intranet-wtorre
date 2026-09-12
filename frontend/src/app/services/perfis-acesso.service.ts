import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  ColaboradorBusca,
  ModuloAdmin,
  PerfilAcesso,
  UsuarioAcesso,
} from '../models/perfil-acesso.model';

@Injectable({ providedIn: 'root' })
export class PerfisAcessoService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/perfis-acesso`;

  listarModulos(): Observable<ModuloAdmin[]> {
    return this.http.get<ModuloAdmin[]>(`${this.base}/modulos`);
  }

  listarPerfis(): Observable<PerfilAcesso[]> {
    return this.http.get<PerfilAcesso[]>(`${this.base}/perfis`);
  }

  criarPerfil(body: { nome: string; descricao?: string; ativo?: boolean }): Observable<PerfilAcesso> {
    return this.http.post<PerfilAcesso>(`${this.base}/perfis`, body);
  }

  atualizarPerfil(
    id: number,
    body: { nome: string; descricao?: string; ativo?: boolean }
  ): Observable<PerfilAcesso> {
    return this.http.put<PerfilAcesso>(`${this.base}/perfis/${id}`, body);
  }

  excluirPerfil(id: number): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`${this.base}/perfis/${id}`);
  }

  definirModulosPerfil(id: number, modulos: string[]): Observable<PerfilAcesso> {
    return this.http.put<PerfilAcesso>(`${this.base}/perfis/${id}/modulos`, { modulos });
  }

  listarUsuarios(): Observable<UsuarioAcesso[]> {
    return this.http.get<UsuarioAcesso[]>(`${this.base}/usuarios`);
  }

  buscarColaboradores(q: string): Observable<ColaboradorBusca[]> {
    return this.http.get<ColaboradorBusca[]>(`${this.base}/usuarios/buscar`, {
      params: { q },
    });
  }

  obterUsuario(id: number): Observable<UsuarioAcesso> {
    return this.http.get<UsuarioAcesso>(`${this.base}/usuarios/${id}`);
  }

  salvarUsuario(
    id: number,
    body: { perfil_ids: number[]; modulos_extra: string[]; colaborador_id?: number }
  ): Observable<UsuarioAcesso> {
    return this.http.put<UsuarioAcesso>(`${this.base}/usuarios/${id}`, body);
  }

  patchAtivo(id: number, ativo: boolean): Observable<UsuarioAcesso> {
    return this.http.patch<UsuarioAcesso>(`${this.base}/usuarios/${id}/ativo`, { ativo });
  }

  patchPerfil(id: number, perfil: 'ADMIN' | 'USER'): Observable<UsuarioAcesso> {
    return this.http.patch<UsuarioAcesso>(`${this.base}/usuarios/${id}/perfil`, { perfil });
  }

  excluirUsuario(id: number): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`${this.base}/usuarios/${id}`);
  }
}
