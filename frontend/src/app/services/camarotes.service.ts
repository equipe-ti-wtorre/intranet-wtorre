import { HttpClient, HttpParams, HttpResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  CamaroteUnidade,
  CamarotesAcesso,
  CamarotesAlertasEnvioLog,
  CamarotesAlertasContratosResposta,
  CamarotesConfig,
  CamarotesDashboard,
  CamarotesSyncLog,
  CamarotesVisualizador,
  EnviarAlertasResposta,
  EnviarResumoResposta,
  EnvioAlertaJobResposta,
  EnvioAlertaStatusResposta,
  GatilhoPreviewResposta,
  SituacaoUnidade,
  SyncResumo,
  TipoUnidade,
} from '../models/camarote.model';

@Injectable({ providedIn: 'root' })
export class CamarotesService {
  private readonly http = inject(HttpClient);

  private api(path: string): string {
    return `${environment.apiBaseUrl}${path}`;
  }

  dashboard(): Observable<CamarotesDashboard> {
    return this.http.get<CamarotesDashboard>(this.api('/camarotes/dashboard'));
  }

  podeVisualizar(): Observable<CamarotesAcesso> {
    return this.http.get<CamarotesAcesso>(this.api('/camarotes/acesso'));
  }

  listarVisualizadores(): Observable<CamarotesVisualizador[]> {
    return this.http.get<CamarotesVisualizador[]>(this.api('/camarotes/visualizadores'));
  }

  adicionarVisualizador(body: { usuario_id?: number; colaborador_id?: number }): Observable<CamarotesVisualizador> {
    return this.http.post<CamarotesVisualizador>(this.api('/camarotes/visualizadores'), body);
  }

  removerVisualizador(usuarioId: number): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(this.api(`/camarotes/visualizadores/${usuarioId}`));
  }

  unidades(filtros?: {
    tipo?: TipoUnidade;
    setor?: string;
    situacao?: SituacaoUnidade;
    dias_restantes_min?: number;
    dias_restantes_max?: number;
  }): Observable<CamaroteUnidade[]> {
    let params = new HttpParams();
    if (filtros?.tipo) params = params.set('tipo', filtros.tipo);
    if (filtros?.setor) params = params.set('setor', filtros.setor);
    if (filtros?.situacao) params = params.set('situacao', filtros.situacao);
    if (filtros?.dias_restantes_min != null) {
      params = params.set('dias_restantes_min', String(filtros.dias_restantes_min));
    }
    if (filtros?.dias_restantes_max != null) {
      params = params.set('dias_restantes_max', String(filtros.dias_restantes_max));
    }
    return this.http.get<CamaroteUnidade[]>(this.api('/camarotes/unidades'), { params });
  }

  obterConfig(): Observable<CamarotesConfig> {
    return this.http.get<CamarotesConfig>(this.api('/camarotes/config'));
  }

  salvarConfig(config: Partial<CamarotesConfig>): Observable<CamarotesConfig> {
    return this.http.put<CamarotesConfig>(this.api('/camarotes/config'), config);
  }

  sincronizar(): Observable<SyncResumo> {
    return this.http.post<SyncResumo>(this.api('/camarotes/sincronizar'), {});
  }

  syncLog(limit = 20): Observable<CamarotesSyncLog[]> {
    return this.http.get<CamarotesSyncLog[]>(this.api('/camarotes/sync-log'), {
      params: { limit: String(limit) },
    });
  }

  alertasEnvioLog(limit = 50): Observable<CamarotesAlertasEnvioLog[]> {
    return this.http.get<CamarotesAlertasEnvioLog[]>(this.api('/camarotes/alertas-envio-log'), {
      params: { limit: String(limit) },
    });
  }

  alertasContratos(filtros?: {
    gatilho_dias?: number;
    notificado?: boolean;
  }): Observable<CamarotesAlertasContratosResposta> {
    let params = new HttpParams();
    if (filtros?.gatilho_dias != null) {
      params = params.set('gatilho_dias', String(filtros.gatilho_dias));
    }
    if (filtros?.notificado === true) {
      params = params.set('notificado', 'true');
    } else if (filtros?.notificado === false) {
      params = params.set('notificado', 'false');
    }
    return this.http.get<CamarotesAlertasContratosResposta>(this.api('/camarotes/alertas-contratos'), {
      params,
    });
  }

  previewGatilho(dias: number): Observable<GatilhoPreviewResposta> {
    return this.http.get<GatilhoPreviewResposta>(this.api(`/camarotes/gatilhos/${dias}/preview`));
  }

  enviarTesteGatilho(dias: number, to?: string): Observable<{ ok: boolean; mensagem: string }> {
    return this.http.post<{ ok: boolean; mensagem: string }>(
      this.api(`/camarotes/gatilhos/${dias}/teste`),
      { to }
    );
  }

  enviarAlertas(
    preview = false,
    opts?: { gatilho_dias?: number; unidade_id?: number },
    forcar = false
  ): Observable<EnviarAlertasResposta> {
    let params = this.enviarAlertasParams(preview, opts, forcar);
    return this.http.post<EnviarAlertasResposta>(this.api('/camarotes/enviar-alertas'), {}, { params });
  }

  enviarAlertasAsync(
    opts?: { gatilho_dias?: number; unidade_id?: number },
    forcar = false
  ): Observable<HttpResponse<EnvioAlertaJobResposta>> {
    const params = this.enviarAlertasParams(false, opts, forcar);
    return this.http.post<EnvioAlertaJobResposta>(
      this.api('/camarotes/enviar-alertas'),
      {},
      { params, observe: 'response' }
    );
  }

  statusEnvioAlertas(jobKey: string): Observable<EnvioAlertaStatusResposta> {
    return this.http.get<EnvioAlertaStatusResposta>(this.api('/camarotes/enviar-alertas/status'), {
      params: { job_key: jobKey },
    });
  }

  private enviarAlertasParams(
    preview: boolean,
    opts?: { gatilho_dias?: number; unidade_id?: number },
    forcar = false
  ): HttpParams {
    let params = new HttpParams();
    if (preview) params = params.set('preview', '1');
    if (forcar) params = params.set('forcar', 'true');
    if (opts?.gatilho_dias != null) params = params.set('gatilho_dias', String(opts.gatilho_dias));
    if (opts?.unidade_id != null) params = params.set('unidade_id', String(opts.unidade_id));
    return params;
  }

  /** @deprecated Use enviarAlertas() */
  enviarResumo(preview = false): Observable<EnviarResumoResposta> {
    return this.enviarAlertas(preview);
  }
}
