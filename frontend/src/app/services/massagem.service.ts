import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  MassagemAdminReserva,
  MassagemDashboard,
  MassagemEmpresa,
  MassagemEvento,
  MassagemFilaItem,
  MassagemLayout,
  MassagemConfig,
  MassagemEmailTemplate,
  MassagemEmailTemplateMeta,
  MassagemEmailTemplatePreview,
  MassagemEmailLista,
  MassagemEmailListaItem,
  MassagemDisparoResult,
  MassagemEmailEnvio,
  MassagemMinhasResponse,
  MassagemSlotsResponse,
} from '../models/massagem.model';

@Injectable({ providedIn: 'root' })
export class MassagemService {
  private readonly http = inject(HttpClient);

  private api(path: string): string {
    return `${environment.apiBaseUrl}/massagem${path}`;
  }

  getLayout(): Observable<MassagemLayout> {
    return this.http.get<MassagemLayout>(this.api('/layout'));
  }

  saveLayout(body: MassagemLayout): Observable<MassagemLayout> {
    return this.http.put<MassagemLayout>(this.api('/layout'), body);
  }

  getConfig(): Observable<MassagemConfig> {
    return this.http.get<MassagemConfig>(this.api('/config'));
  }

  saveConfig(body: MassagemConfig): Observable<MassagemConfig> {
    return this.http.put<MassagemConfig>(this.api('/config'), body);
  }

  listEmpresas(): Observable<MassagemEmpresa[]> {
    return this.http.get<MassagemEmpresa[]>(this.api('/empresas'));
  }

  listEmpresasAdmin(): Observable<MassagemEmpresa[]> {
    return this.http.get<MassagemEmpresa[]>(this.api('/admin/empresas'));
  }

  createEmpresa(body: Partial<MassagemEmpresa>): Observable<MassagemEmpresa> {
    return this.http.post<MassagemEmpresa>(this.api('/admin/empresas'), body);
  }

  updateEmpresa(id: string, body: Partial<MassagemEmpresa>): Observable<MassagemEmpresa> {
    return this.http.put<MassagemEmpresa>(this.api(`/admin/empresas/${id}`), body);
  }

  removeEmpresa(id: string): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(this.api(`/admin/empresas/${id}`));
  }

  listEventos(all = false): Observable<MassagemEvento[]> {
    const q = all ? '?all=1' : '';
    return this.http.get<MassagemEvento[]>(this.api(`/eventos${q}`));
  }

  createEvento(body: Record<string, unknown>): Observable<MassagemEvento> {
    return this.http.post<MassagemEvento>(this.api('/eventos'), body);
  }

  updateEvento(id: string, body: Record<string, unknown>): Observable<MassagemEvento> {
    return this.http.put<MassagemEvento>(this.api(`/eventos/${id}`), body);
  }

  removeEvento(id: string): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(this.api(`/eventos/${id}`));
  }

  dispararEvento(id: string, body?: { codigoTemplate?: string }): Observable<MassagemDisparoResult> {
    return this.http.post<MassagemDisparoResult>(this.api(`/eventos/${id}/disparar`), body || {});
  }

  listEmailEnvios(params?: { email?: string; tipo?: string }): Observable<MassagemEmailEnvio[]> {
    const q: Record<string, string> = {};
    if (params?.email) q['email'] = params.email;
    if (params?.tipo) q['tipo'] = params.tipo;
    return this.http.get<MassagemEmailEnvio[]>(this.api('/admin/envios'), { params: q });
  }

  listEmailListas(): Observable<MassagemEmailLista[]> {
    return this.http.get<MassagemEmailLista[]>(this.api('/admin/listas'));
  }

  createEmailLista(body: {
    empresaId: string;
    nome: string;
    descricao?: string;
    email?: string;
    nomeContato?: string;
  }): Observable<MassagemEmailLista> {
    return this.http.post<MassagemEmailLista>(this.api('/admin/listas'), body);
  }

  updateEmailLista(
    id: string,
    body: { nome: string; descricao?: string }
  ): Observable<MassagemEmailLista> {
    return this.http.put<MassagemEmailLista>(this.api(`/admin/listas/${id}`), body);
  }

  removeEmailLista(id: string): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(this.api(`/admin/listas/${id}`));
  }

  listEmailListaItens(listaId: string): Observable<MassagemEmailListaItem[]> {
    return this.http.get<MassagemEmailListaItem[]>(this.api(`/admin/listas/${listaId}/itens`));
  }

  addEmailListaItem(
    listaId: string,
    body: { email: string; nome?: string }
  ): Observable<MassagemEmailListaItem> {
    return this.http.post<MassagemEmailListaItem>(this.api(`/admin/listas/${listaId}/itens`), body);
  }

  removeEmailListaItem(listaId: string, itemId: string): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(
      this.api(`/admin/listas/${listaId}/itens/${itemId}`)
    );
  }

  listSlots(eventoId: string, data: string): Observable<MassagemSlotsResponse> {
    return this.http.get<MassagemSlotsResponse>(this.api('/reservas'), {
      params: { eventoId, data },
    });
  }

  createReserva(body: {
    eventoId: string;
    chave: string;
    observacao?: string;
  }): Observable<{ chave: string }> {
    return this.http.post<{ chave: string }>(this.api('/reservas'), body);
  }

  trocarReserva(chave: string, novaChave: string): Observable<{ chave: string }> {
    return this.http.put<{ chave: string }>(
      this.api(`/reservas/${encodeURIComponent(chave)}/trocar`),
      { novaChave }
    );
  }

  cancelarReserva(chave: string): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(
      this.api(`/reservas/${encodeURIComponent(chave)}`)
    );
  }

  minhasReservas(): Observable<MassagemMinhasResponse> {
    return this.http.get<MassagemMinhasResponse>(this.api('/reservas/minhas'));
  }

  listFila(eventoId: string): Observable<{ fila: MassagemFilaItem[] }> {
    return this.http.get<{ fila: MassagemFilaItem[] }>(this.api('/fila'), {
      params: { eventoId },
    });
  }

  entrarFila(eventoId: string): Observable<{ posicao: number; total: number }> {
    return this.http.post<{ posicao: number; total: number }>(this.api('/fila'), { eventoId });
  }

  sairFila(id: string): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(this.api(`/fila/${id}`));
  }

  dashboard(): Observable<MassagemDashboard> {
    return this.http.get<MassagemDashboard>(this.api('/admin/dashboard'));
  }

  adminReservas(eventoId: string): Observable<MassagemAdminReserva[]> {
    return this.http.get<MassagemAdminReserva[]>(this.api('/admin/reservas'), {
      params: { eventoId },
    });
  }

  adminRemoverReserva(chave: string): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(
      this.api(`/admin/reservas/${encodeURIComponent(chave)}`)
    );
  }

  listEmailTemplates(): Observable<MassagemEmailTemplate[]> {
    return this.http.get<MassagemEmailTemplate[]>(this.api('/admin/email-templates'));
  }

  getEmailTemplateMeta(): Observable<MassagemEmailTemplateMeta> {
    return this.http.get<MassagemEmailTemplateMeta>(this.api('/admin/email-templates/meta'));
  }

  getEmailTemplate(id: string): Observable<MassagemEmailTemplate> {
    return this.http.get<MassagemEmailTemplate>(this.api(`/admin/email-templates/${id}`));
  }

  createEmailTemplate(body: Partial<MassagemEmailTemplate>): Observable<MassagemEmailTemplate> {
    return this.http.post<MassagemEmailTemplate>(this.api('/admin/email-templates'), body);
  }

  updateEmailTemplate(
    id: string,
    body: Partial<MassagemEmailTemplate>
  ): Observable<MassagemEmailTemplate> {
    return this.http.put<MassagemEmailTemplate>(this.api(`/admin/email-templates/${id}`), body);
  }

  removeEmailTemplate(id: string): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(this.api(`/admin/email-templates/${id}`));
  }

  previewEmailTemplate(body: {
    id?: string;
    codigo?: string;
    assunto?: string;
    html?: string;
    texto?: string;
  }): Observable<MassagemEmailTemplatePreview> {
    return this.http.post<MassagemEmailTemplatePreview>(
      this.api('/admin/email-templates/preview'),
      body
    );
  }
}
