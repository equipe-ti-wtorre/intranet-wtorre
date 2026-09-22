import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  CipaEvento,
  CipaInscricaoResposta,
  CipaInscritosResposta,
} from '../models/cipa.model';
import { ColaboradorBusca } from '../models/perfil-acesso.model';

@Injectable({ providedIn: 'root' })
export class CipaService {
  private readonly http = inject(HttpClient);

  private api(path: string): string {
    return `${environment.apiBaseUrl}/agenda_rh${path}`;
  }

  listar(): Observable<CipaEvento[]> {
    return this.http.get<CipaEvento[]>(this.api('/eventos'));
  }

  obter(codigo: string): Observable<CipaEvento> {
    return this.http.get<CipaEvento>(this.api(`/eventos/${codigo}`));
  }

  imagem(codigo: string, versao?: string | null): Observable<Blob> {
    return this.http.get(this.api(`/eventos/${codigo}/imagem`), {
      responseType: 'blob',
      params: versao ? { v: versao } : {},
    });
  }

  inscrever(
    codigo: string,
    body: { slot_id: number; cpf: string; nome?: string; email?: string }
  ): Observable<CipaInscricaoResposta> {
    return this.http.post<CipaInscricaoResposta>(this.api(`/eventos/${codigo}/inscrever`), body);
  }

  listarAdmin(): Observable<CipaEvento[]> {
    return this.http.get<CipaEvento[]>(this.api('/admin/eventos'));
  }

  obterAdmin(codigo: string): Observable<CipaEvento> {
    return this.http.get<CipaEvento>(this.api(`/admin/eventos/${codigo}`));
  }

  criar(form: FormData): Observable<CipaEvento> {
    return this.http.post<CipaEvento>(this.api('/admin/eventos'), form);
  }

  atualizar(codigo: string, form: FormData): Observable<CipaEvento> {
    return this.http.put<CipaEvento>(this.api(`/admin/eventos/${codigo}`), form);
  }

  excluir(codigo: string): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(this.api(`/admin/eventos/${codigo}`));
  }

  inscritos(codigo: string): Observable<CipaInscritosResposta> {
    return this.http.get<CipaInscritosResposta>(this.api(`/admin/eventos/${codigo}/inscritos`));
  }

  excluirInscricao(codigo: string, inscricaoId: number): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(
      this.api(`/admin/eventos/${codigo}/inscricoes/${inscricaoId}`)
    );
  }

  exportarXlsx(codigo: string): Observable<Blob> {
    return this.http.get(this.api(`/admin/eventos/${codigo}/export.xlsx`), {
      responseType: 'blob',
    });
  }

  buscarColaboradores(q: string): Observable<ColaboradorBusca[]> {
    return this.http.get<ColaboradorBusca[]>(this.api('/admin/colaboradores'), {
      params: { q },
    });
  }

  linkPublico(ev: Pick<CipaEvento, 'codigo'>): string {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return `${origin}/${ev.codigo}`;
  }
}
