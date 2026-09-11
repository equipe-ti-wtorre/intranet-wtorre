import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  ListaTipo,
  PesquisasAprovador,
  PesquisasFormulario,
  PesquisasListItem,
  PesquisasRequisicao,
  PesquisasMinhaResposta,
  PesquisasPublicoMeta,
  PesquisasResponderPayload,
  PesquisasResultados,
  PesquisasResumo,
  PesquisasTemplateVisual,
} from '../models/pesquisas.model';

@Injectable({ providedIn: 'root' })
export class PesquisasService {
  private readonly http = inject(HttpClient);

  private api(path: string): string {
    return `${environment.apiBaseUrl}/pesquisas${path}`;
  }

  resumo(): Observable<PesquisasResumo> {
    return this.http.get<PesquisasResumo>(this.api('/resumo'));
  }

  departamentos(): Observable<string[]> {
    return this.http.get<string[]>(this.api('/departamentos'));
  }

  buscarAprovadores(q: string): Observable<PesquisasAprovador[]> {
    const params = new HttpParams().set('q', q);
    return this.http.get<PesquisasAprovador[]>(this.api('/aprovadores'), { params });
  }

  listFormularios(lista: ListaTipo, q = '', status = 'all'): Observable<PesquisasListItem[]> {
    let params = new HttpParams().set('lista', lista);
    if (q) params = params.set('q', q);
    if (status && status !== 'all') params = params.set('status', status);
    return this.http.get<PesquisasListItem[]>(this.api('/formularios'), { params });
  }

  listRequisicoes(lista: ListaTipo, q = '', status = 'all'): Observable<PesquisasListItem[]> {
    let params = new HttpParams().set('lista', lista);
    if (q) params = params.set('q', q);
    if (status && status !== 'all') params = params.set('status', status);
    return this.http.get<PesquisasListItem[]>(this.api('/requisicoes'), { params });
  }

  getFormulario(id: number): Observable<PesquisasFormulario> {
    return this.http.get<PesquisasFormulario>(this.api(`/formularios/${id}`));
  }

  clonarFormulario(id: number): Observable<PesquisasFormulario> {
    return this.http.post<PesquisasFormulario>(this.api(`/formularios/${id}/clonar`), {});
  }

  salvarRascunho(body: Record<string, unknown>, id?: number): Observable<PesquisasFormulario> {
    if (id) {
      return this.http.post<PesquisasFormulario>(this.api(`/formularios/${id}/rascunho`), body);
    }
    return this.http.post<PesquisasFormulario>(this.api('/formularios'), body);
  }

  publicar(body: Record<string, unknown>, id: number): Observable<PesquisasFormulario> {
    return this.http.post<PesquisasFormulario>(this.api(`/formularios/${id}/publicar`), body);
  }

  encerrarFormulario(id: number): Observable<PesquisasFormulario> {
    return this.http.post<PesquisasFormulario>(this.api(`/formularios/${id}/encerrar`), {});
  }

  excluirFormulario(id: number): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(this.api(`/formularios/${id}`));
  }

  payloadResponder(id: number): Observable<PesquisasResponderPayload> {
    return this.http.get<PesquisasResponderPayload>(this.api(`/formularios/${id}/responder`));
  }

  lookupBase(id: number, valor: string): Observable<{ campos: Record<string, string> }> {
    return this.http.post<{ campos: Record<string, string> }>(
      this.api(`/formularios/${id}/base/lookup`),
      { valor }
    );
  }

  publicoLookupBase(
    slug: string,
    valor: string,
    token?: string
  ): Observable<{ campos: Record<string, string> }> {
    const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
    return this.http.post<{ campos: Record<string, string> }>(
      this.api(`/publico/${encodeURIComponent(slug)}/base/lookup`),
      { valor },
      { headers }
    );
  }

  enviarResposta(
    id: number,
    itens: { perguntaId: number; valor: string }[],
    anexos?: Record<number, File>
  ): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(
      this.api(`/formularios/${id}/respostas`),
      this.respostaBody(itens, anexos)
    );
  }

  resultados(id: number): Observable<PesquisasResultados> {
    return this.http.get<PesquisasResultados>(this.api(`/formularios/${id}/resultados`));
  }

  minhaResposta(id: number): Observable<PesquisasMinhaResposta> {
    return this.http.get<PesquisasMinhaResposta>(this.api(`/formularios/${id}/minha-resposta`));
  }

  despublicar(id: number): Observable<PesquisasFormulario> {
    return this.http.post<PesquisasFormulario>(this.api(`/formularios/${id}/despublicar`), {});
  }

  atualizarEvento(id: number, eventoAtivo: boolean): Observable<PesquisasFormulario> {
    return this.http.post<PesquisasFormulario>(this.api(`/formularios/${id}/evento`), {
      eventoAtivo,
    });
  }

  listTemplates(): Observable<PesquisasTemplateVisual[]> {
    return this.http.get<PesquisasTemplateVisual[]>(this.api('/templates'));
  }

  adminTemplates(q = ''): Observable<PesquisasTemplateVisual[]> {
    const params = q ? new HttpParams().set('q', q) : undefined;
    return this.http.get<PesquisasTemplateVisual[]>(this.api('/admin/templates'), { params });
  }

  criarTemplate(body: Record<string, unknown>): Observable<PesquisasTemplateVisual> {
    return this.http.post<PesquisasTemplateVisual>(this.api('/admin/templates'), body);
  }

  atualizarTemplate(id: number, body: Record<string, unknown>): Observable<PesquisasTemplateVisual> {
    return this.http.put<PesquisasTemplateVisual>(this.api(`/admin/templates/${id}`), body);
  }

  excluirTemplate(id: number): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(this.api(`/admin/templates/${id}`));
  }

  uploadCapa(id: number, file: File): Observable<PesquisasFormulario> {
    const fd = new FormData();
    fd.append('capa', file);
    return this.http.post<PesquisasFormulario>(this.api(`/formularios/${id}/capa`), fd);
  }

  removerCapa(id: number): Observable<PesquisasFormulario> {
    return this.http.delete<PesquisasFormulario>(this.api(`/formularios/${id}/capa`));
  }

  publicoMeta(slug: string): Observable<PesquisasPublicoMeta> {
    return this.http.get<PesquisasPublicoMeta>(this.api(`/publico/${encodeURIComponent(slug)}`));
  }

  publicoVerificar(
    slug: string,
    body: { cpf: string; email: string }
  ): Observable<{ token: string; nome: string | null }> {
    return this.http.post<{ token: string; nome: string | null }>(
      this.api(`/publico/${encodeURIComponent(slug)}/verificar`),
      body
    );
  }

  publicoFormulario(slug: string, token?: string): Observable<PesquisasResponderPayload> {
    const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
    return this.http.get<PesquisasResponderPayload>(
      this.api(`/publico/${encodeURIComponent(slug)}/formulario`),
      { headers }
    );
  }

  publicoResponder(
    slug: string,
    itens: { perguntaId: number; valor: string }[],
    token?: string,
    anexos?: Record<number, File>
  ): Observable<{ ok: boolean }> {
    const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
    return this.http.post<{ ok: boolean }>(
      this.api(`/publico/${encodeURIComponent(slug)}/respostas`),
      this.respostaBody(itens, anexos),
      { headers }
    );
  }

  private respostaBody(
    itens: { perguntaId: number; valor: string }[],
    anexos?: Record<number, File>
  ): FormData | { itens: { perguntaId: number; valor: string }[] } {
    const files = Object.entries(anexos || {}).filter(([, f]) => !!f);
    if (!files.length) return { itens };
    const fd = new FormData();
    fd.append('itens', JSON.stringify(itens));
    for (const [id, file] of files) {
      fd.append(`anexo_${id}`, file);
    }
    return fd;
  }

  getRequisicao(id: number): Observable<PesquisasRequisicao> {
    return this.http.get<PesquisasRequisicao>(this.api(`/requisicoes/${id}`));
  }

  criarRequisicao(fd: FormData): Observable<PesquisasRequisicao> {
    return this.http.post<PesquisasRequisicao>(this.api('/requisicoes'), fd);
  }

  decidirRequisicao(id: number, acao: 'aprovar' | 'rejeitar'): Observable<PesquisasRequisicao> {
    return this.http.post<PesquisasRequisicao>(this.api(`/requisicoes/${id}/decidir`), { acao });
  }

  anexoRequisicao(id: number): Observable<{ url: string }> {
    return this.http.get<{ url: string }>(this.api(`/requisicoes/${id}/anexo`));
  }

  excluirRequisicao(id: number): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(this.api(`/requisicoes/${id}`));
  }

  adminFormularios(q = ''): Observable<PesquisasListItem[]> {
    const params = q ? new HttpParams().set('q', q) : undefined;
    return this.http.get<PesquisasListItem[]>(this.api('/admin/formularios'), { params });
  }

  adminRequisicoes(q = ''): Observable<PesquisasListItem[]> {
    const params = q ? new HttpParams().set('q', q) : undefined;
    return this.http.get<PesquisasListItem[]>(this.api('/admin/requisicoes'), { params });
  }

  adminExcluirFormulario(id: number): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(this.api(`/admin/formularios/${id}`));
  }

  adminEncerrarFormulario(id: number): Observable<PesquisasFormulario> {
    return this.http.post<PesquisasFormulario>(this.api(`/admin/formularios/${id}/encerrar`), {});
  }

  adminExcluirRequisicao(id: number): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(this.api(`/admin/requisicoes/${id}`));
  }
}
