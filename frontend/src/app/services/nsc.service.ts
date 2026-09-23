import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  NscAcesso,
  NscCertificadoDetalhe,
  NscColaboradorAdmin,
  NscColaboradoresResposta,
  NscConfig,
  NscMeu,
  NscNotificacaoLog,
  NscOverride,
  NscPreviewNotificacao,
  NscRegraDepartamento,
  NscResumo,
  NscStatus,
  NscAprovacaoItem,
  NscAprovacaoStatus,
  NscValidacao,
  NscEquipeResposta,
  NscVisualizador,
  NscAcessoLog,
} from '../models/nsc.model';

@Injectable({ providedIn: 'root' })
export class NscService {
  private readonly http = inject(HttpClient);

  private api(path: string): string {
    return `${environment.apiBaseUrl}/nsc${path}`;
  }

  podeVisualizar(): Observable<NscAcesso> {
    return this.http.get<NscAcesso>(this.api('/acesso'));
  }

  meu(): Observable<NscMeu> {
    return this.http.get<NscMeu>(this.api('/meu'));
  }

  validar(formData: FormData): Observable<NscValidacao> {
    return this.http.post<NscValidacao>(this.api('/meu/validar'), formData);
  }

  enviar(formData: FormData): Observable<NscMeu> {
    return this.http.post<NscMeu>(this.api('/meu/envio'), formData);
  }

  urlMeuCertificado(download = false): string {
    const q = download ? '?download=1' : '';
    return this.api(`/meu/certificado${q}`);
  }

  baixarMeu(download = false): Observable<Blob> {
    return this.http.get(this.urlMeuCertificado(download), { responseType: 'blob' });
  }

  removerMeu(envioId?: number): Observable<NscMeu> {
    let params = new HttpParams();
    if (envioId) params = params.set('envioId', String(envioId));
    return this.http.delete<NscMeu>(this.api('/meu/certificado'), { params });
  }

  resumo(): Observable<NscResumo> {
    return this.http.get<NscResumo>(this.api('/admin/resumo'));
  }

  exportarRelatorioXlsx(departamento?: string): Observable<Blob> {
    let params = new HttpParams();
    if (departamento) params = params.set('departamento', departamento);
    return this.http.get(this.api('/admin/relatorio.xlsx'), {
      params,
      responseType: 'blob',
    });
  }

  listarColaboradores(filtros: {
    busca?: string;
    departamento?: string;
    empresa?: string;
    status?: NscStatus | '';
    somente_obrigatorios?: boolean;
  }): Observable<NscColaboradoresResposta> {
    let params = new HttpParams();
    if (filtros.busca) params = params.set('busca', filtros.busca);
    if (filtros.departamento) params = params.set('departamento', filtros.departamento);
    if (filtros.empresa) params = params.set('empresa', filtros.empresa);
    if (filtros.status) params = params.set('status', filtros.status);
    if (filtros.somente_obrigatorios) params = params.set('somente_obrigatorios', '1');
    return this.http.get<NscColaboradoresResposta>(this.api('/admin/colaboradores'), { params });
  }

  patchObrigatorio(adObjectId: string, override: NscOverride): Observable<NscColaboradorAdmin> {
    return this.http.patch<NscColaboradorAdmin>(
      this.api(`/admin/colaboradores/${encodeURIComponent(adObjectId)}`),
      { obrigatorio_override: override }
    );
  }

  patchObrigatorioLote(
    adObjectIds: string[],
    override: NscOverride
  ): Observable<{ atualizados: number; ignorados: number }> {
    return this.http.patch<{ atualizados: number; ignorados: number }>(
      this.api('/admin/colaboradores/lote'),
      { ad_object_ids: adObjectIds, obrigatorio_override: override }
    );
  }

  certificadoAdmin(adObjectId: string): Observable<NscCertificadoDetalhe> {
    return this.http.get<NscCertificadoDetalhe>(
      this.api(`/admin/colaboradores/${encodeURIComponent(adObjectId)}/certificado`)
    );
  }

  urlCertificadoAdmin(adObjectId: string, download = false, envioId?: number): string {
    const params = new URLSearchParams();
    if (download) params.set('download', '1');
    else params.set('arquivo', '1');
    if (envioId) params.set('envioId', String(envioId));
    return this.api(
      `/admin/colaboradores/${encodeURIComponent(adObjectId)}/certificado?${params.toString()}`
    );
  }

  removerAdmin(adObjectId: string, envioId?: number): Observable<NscCertificadoDetalhe> {
    let params = new HttpParams();
    if (envioId) params = params.set('envioId', String(envioId));
    return this.http.delete<NscCertificadoDetalhe>(
      this.api(`/admin/colaboradores/${encodeURIComponent(adObjectId)}/certificado`),
      { params }
    );
  }

  baixarAdmin(adObjectId: string, download = false, envioId?: number): Observable<Blob> {
    return this.http.get(this.urlCertificadoAdmin(adObjectId, download, envioId), {
      responseType: 'blob',
    });
  }

  miniaturaAdmin(adObjectId: string, envioId?: number): Observable<Blob> {
    const params = new URLSearchParams();
    params.set('miniatura', '1');
    if (envioId) params.set('envioId', String(envioId));
    return this.http.get(
      this.api(`/admin/colaboradores/${encodeURIComponent(adObjectId)}/certificado?${params}`),
      { responseType: 'blob' }
    );
  }

  miniaturaMeu(): Observable<Blob> {
    return this.http.get(this.api('/meu/certificado?miniatura=1'), { responseType: 'blob' });
  }

  listarAprovacoes(status: NscAprovacaoStatus | '' = 'pendente'): Observable<{
    aprovacoes: NscAprovacaoItem[];
    pendentes: number;
  }> {
    let params = new HttpParams();
    if (status) params = params.set('status', status);
    return this.http.get<{ aprovacoes: NscAprovacaoItem[]; pendentes: number }>(
      this.api('/admin/aprovacoes'),
      { params }
    );
  }

  aprovarEnvio(envioId: number, motivo: string): Observable<NscAprovacaoItem> {
    return this.http.post<NscAprovacaoItem>(
      this.api(`/admin/aprovacoes/${envioId}/aprovar`),
      { motivo }
    );
  }

  rejeitarEnvio(envioId: number, motivo: string): Observable<NscAprovacaoItem> {
    return this.http.post<NscAprovacaoItem>(
      this.api(`/admin/aprovacoes/${envioId}/rejeitar`),
      { motivo }
    );
  }

  regras(): Observable<{ regras: NscRegraDepartamento[] }> {
    return this.http.get<{ regras: NscRegraDepartamento[] }>(this.api('/admin/regras-departamento'));
  }

  salvarRegras(regras: NscRegraDepartamento[]): Observable<{ regras: NscRegraDepartamento[] }> {
    return this.http.put<{ regras: NscRegraDepartamento[] }>(
      this.api('/admin/regras-departamento'),
      { regras }
    );
  }

  salvarGestoresDepartamento(
    departamentoOu: string,
    adObjectIds: string[]
  ): Observable<{ regras: NscRegraDepartamento[] }> {
    return this.http.put<{ regras: NscRegraDepartamento[] }>(
      this.api('/admin/departamentos/gestores'),
      { departamento_ou: departamentoOu, ad_object_ids: adObjectIds }
    );
  }

  getConfig(): Observable<NscConfig> {
    return this.http.get<NscConfig>(this.api('/admin/config'));
  }

  salvarConfig(body: NscConfig): Observable<NscConfig> {
    return this.http.put<NscConfig>(this.api('/admin/config'), body);
  }

  listarNotificacoes(filtros: {
    tipo?: string;
    status?: string;
    busca?: string;
  } = {}): Observable<{ notificacoes: NscNotificacaoLog[] }> {
    let params = new HttpParams();
    if (filtros.tipo) params = params.set('tipo', filtros.tipo);
    if (filtros.status) params = params.set('status', filtros.status);
    if (filtros.busca) params = params.set('busca', filtros.busca);
    return this.http.get<{ notificacoes: NscNotificacaoLog[] }>(this.api('/admin/notificacoes'), {
      params,
    });
  }

  listarEquipe(filtros: {
    busca?: string;
    departamento?: string;
    status?: NscStatus | '';
  } = {}): Observable<NscEquipeResposta> {
    let params = new HttpParams();
    if (filtros.busca) params = params.set('busca', filtros.busca);
    if (filtros.departamento) params = params.set('departamento', filtros.departamento);
    if (filtros.status) params = params.set('status', filtros.status);
    return this.http.get<NscEquipeResposta>(this.api('/equipe'), { params });
  }

  detalheEquipe(adObjectId: string): Observable<NscCertificadoDetalhe> {
    return this.http.get<NscCertificadoDetalhe>(
      this.api(`/equipe/${encodeURIComponent(adObjectId)}`)
    );
  }

  urlCertificadoEquipe(adObjectId: string, download = false, envioId?: number): string {
    const params = new URLSearchParams();
    if (download) params.set('download', '1');
    if (envioId) params.set('envioId', String(envioId));
    return this.api(`/equipe/${encodeURIComponent(adObjectId)}/certificado?${params}`);
  }

  baixarEquipe(adObjectId: string, download = false, envioId?: number): Observable<Blob> {
    return this.http.get(this.urlCertificadoEquipe(adObjectId, download, envioId), {
      responseType: 'blob',
    });
  }

  exportarEquipeXlsx(departamento?: string): Observable<Blob> {
    let params = new HttpParams();
    if (departamento) params = params.set('departamento', departamento);
    return this.http.get(this.api('/equipe/relatorio.xlsx'), { params, responseType: 'blob' });
  }

  lembrarEquipe(body: {
    ad_object_id?: string;
    busca?: string;
    departamento?: string;
    status?: string;
  } = {}): Observable<{ enviados: number; ignorados: number; avaliados: number }> {
    return this.http.post<{ enviados: number; ignorados: number; avaliados: number }>(
      this.api('/equipe/lembretes'),
      body
    );
  }

  aprovarEquipe(envioId: number, motivo: string): Observable<NscAprovacaoItem> {
    return this.http.post<NscAprovacaoItem>(this.api(`/equipe/aprovacoes/${envioId}/aprovar`), {
      motivo,
    });
  }

  rejeitarEquipe(envioId: number, motivo: string): Observable<NscAprovacaoItem> {
    return this.http.post<NscAprovacaoItem>(this.api(`/equipe/aprovacoes/${envioId}/rejeitar`), {
      motivo,
    });
  }

  listarVisualizadores(): Observable<{ visualizadores: NscVisualizador[] }> {
    return this.http.get<{ visualizadores: NscVisualizador[] }>(this.api('/admin/visualizadores'));
  }

  criarVisualizador(
    body: Partial<NscVisualizador> & { ad_object_ids?: string[] }
  ): Observable<NscVisualizador | { visualizadores: NscVisualizador[] }> {
    return this.http.post<NscVisualizador | { visualizadores: NscVisualizador[] }>(
      this.api('/admin/visualizadores'),
      body
    );
  }

  atualizarVisualizador(id: number, body: Partial<NscVisualizador>): Observable<NscVisualizador> {
    return this.http.patch<NscVisualizador>(this.api(`/admin/visualizadores/${id}`), body);
  }

  removerVisualizador(id: number): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(this.api(`/admin/visualizadores/${id}`));
  }

  listarAcessoLog(limite = 80): Observable<{ logs: NscAcessoLog[] }> {
    return this.http.get<{ logs: NscAcessoLog[] }>(this.api('/admin/acesso-log'), {
      params: new HttpParams().set('limite', String(limite)),
    });
  }

  previewNotificacao(tipo: string, dias?: number): Observable<NscPreviewNotificacao> {
    let params = new HttpParams().set('tipo', tipo);
    if (dias != null) params = params.set('dias', String(dias));
    return this.http.get<NscPreviewNotificacao>(this.api('/admin/notificacoes/preview'), { params });
  }
}
