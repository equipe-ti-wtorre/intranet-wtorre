import { HttpClient, HttpEvent, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  SolicitacaoAcesso,
  SolicitacaoCampo,
  SolicitacaoColaborador,
  SolicitacaoCriarResposta,
  SolicitacaoDetalheAdmin,
  SolicitacaoEmailIndividual,
  SolicitacaoGrupo,
  SolicitacaoVisualizador,
  UsuarioAdBusca,
} from '../models/solicitacao-colaborador.model';

@Injectable({ providedIn: 'root' })
export class SolicitacaoColaboradorService {
  private readonly http = inject(HttpClient);

  private api(path: string): string {
    return `${environment.apiBaseUrl}/solicitacao-colaborador${path}`;
  }

  podeVisualizar(): Observable<SolicitacaoAcesso> {
    return this.http.get<SolicitacaoAcesso>(this.api('/acesso'));
  }

  listarCampos(): Observable<SolicitacaoCampo[]> {
    return this.http.get<SolicitacaoCampo[]>(this.api('/campos'));
  }

  criar(formData: FormData): Observable<HttpEvent<SolicitacaoCriarResposta>> {
    return this.http.post<SolicitacaoCriarResposta>(this.api(''), formData, {
      reportProgress: true,
      observe: 'events',
    });
  }

  minhas(): Observable<SolicitacaoColaborador[]> {
    return this.http.get<SolicitacaoColaborador[]>(this.api('/minhas'));
  }

  listarSolicitacoesAdmin(filtros?: {
    tipo?: string;
    status?: string;
    de?: string;
    ate?: string;
  }): Observable<SolicitacaoColaborador[]> {
    let params = new HttpParams();
    if (filtros?.tipo) params = params.set('tipo', filtros.tipo);
    if (filtros?.status) params = params.set('status', filtros.status);
    if (filtros?.de) params = params.set('de', filtros.de);
    if (filtros?.ate) params = params.set('ate', filtros.ate);
    return this.http.get<SolicitacaoColaborador[]>(this.api('/admin/solicitacoes'), { params });
  }

  obterSolicitacaoAdmin(id: number): Observable<SolicitacaoDetalheAdmin> {
    return this.http.get<SolicitacaoDetalheAdmin>(this.api(`/admin/solicitacoes/${id}`));
  }

  previewEmail(solicitacaoId: number, grupoId: number): Observable<{ html: string; subject?: string }> {
    return this.http.get<{ html: string; subject?: string }>(
      this.api(`/admin/solicitacoes/${solicitacaoId}/preview/${grupoId}`)
    );
  }

  reenviarEmail(solicitacaoId: number, grupoId: number): Observable<unknown> {
    return this.http.post(
      this.api(`/admin/solicitacoes/${solicitacaoId}/reenviar/${grupoId}`),
      {}
    );
  }

  previewEmailIndividual(
    solicitacaoId: number,
    emailId: number
  ): Observable<{ html: string; subject?: string }> {
    return this.http.get<{ html: string; subject?: string }>(
      this.api(`/admin/solicitacoes/${solicitacaoId}/preview-individual/${emailId}`)
    );
  }

  reenviarEmailIndividual(solicitacaoId: number, emailId: number): Observable<unknown> {
    return this.http.post(
      this.api(`/admin/solicitacoes/${solicitacaoId}/reenviar-individual/${emailId}`),
      {}
    );
  }

  listarGrupos(): Observable<SolicitacaoGrupo[]> {
    return this.http.get<SolicitacaoGrupo[]>(this.api('/admin/grupos'));
  }

  criarGrupo(body: Partial<SolicitacaoGrupo>): Observable<SolicitacaoGrupo> {
    return this.http.post<SolicitacaoGrupo>(this.api('/admin/grupos'), body);
  }

  atualizarGrupo(id: number, body: Partial<SolicitacaoGrupo>): Observable<SolicitacaoGrupo> {
    return this.http.put<SolicitacaoGrupo>(this.api(`/admin/grupos/${id}`), body);
  }

  removerGrupo(id: number): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(this.api(`/admin/grupos/${id}`));
  }

  listarEmailsIndividuais(): Observable<SolicitacaoEmailIndividual[]> {
    return this.http.get<SolicitacaoEmailIndividual[]>(this.api('/admin/emails-individuais'));
  }

  criarEmailIndividual(
    body: Partial<SolicitacaoEmailIndividual>
  ): Observable<SolicitacaoEmailIndividual> {
    return this.http.post<SolicitacaoEmailIndividual>(this.api('/admin/emails-individuais'), body);
  }

  atualizarEmailIndividual(
    id: number,
    body: Partial<SolicitacaoEmailIndividual>
  ): Observable<SolicitacaoEmailIndividual> {
    return this.http.put<SolicitacaoEmailIndividual>(
      this.api(`/admin/emails-individuais/${id}`),
      body
    );
  }

  removerEmailIndividual(id: number): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(this.api(`/admin/emails-individuais/${id}`));
  }

  buscarUsuariosAd(q: string): Observable<UsuarioAdBusca[]> {
    return this.http.get<UsuarioAdBusca[]>(this.api('/admin/usuarios-ad/buscar'), {
      params: { q },
    });
  }

  listarVisualizadores(): Observable<SolicitacaoVisualizador[]> {
    return this.http.get<SolicitacaoVisualizador[]>(this.api('/admin/visualizadores'));
  }

  adicionarVisualizador(body: {
    usuario_id?: number;
    colaborador_id?: number;
  }): Observable<SolicitacaoVisualizador> {
    return this.http.post<SolicitacaoVisualizador>(this.api('/admin/visualizadores'), body);
  }

  removerVisualizador(usuarioId: number): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(this.api(`/admin/visualizadores/${usuarioId}`));
  }
}
