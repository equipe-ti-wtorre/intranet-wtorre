import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  EventoFonte,
  EventoFonteLogoUploadResponse,
  EventoFontePayload,
  EventoFonteTesteResponse,
  EventoParserTipo,
} from '../models/evento.model';

@Injectable({ providedIn: 'root' })
export class EventosFontesService {
  private readonly http = inject(HttpClient);

  private api(path: string): string {
    return `${environment.apiBaseUrl}${path}`;
  }

  listarParsers(): Observable<EventoParserTipo[]> {
    return this.http.get<EventoParserTipo[]>(this.api('/eventos/parsers'));
  }

  listarAdmin(busca?: string): Observable<EventoFonte[]> {
    const params = busca?.trim() ? { busca: busca.trim() } : undefined;
    return this.http.get<EventoFonte[]>(this.api('/eventos/fontes/admin'), { params });
  }

  criar(payload: EventoFontePayload): Observable<EventoFonte> {
    return this.http.post<EventoFonte>(this.api('/eventos/fontes'), this.toBody(payload));
  }

  atualizar(id: number, payload: Partial<EventoFontePayload>): Observable<EventoFonte> {
    return this.http.put<EventoFonte>(this.api(`/eventos/fontes/${id}`), this.toBody(payload));
  }

  remover(id: number): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(this.api(`/eventos/fontes/${id}`));
  }

  testar(id: number): Observable<EventoFonteTesteResponse> {
    return this.http.post<EventoFonteTesteResponse>(this.api(`/eventos/fontes/${id}/testar`), {});
  }

  uploadLogo(file: File): Observable<EventoFonteLogoUploadResponse> {
    const form = new FormData();
    form.append('imagem', file);
    return this.http.post<EventoFonteLogoUploadResponse>(
      this.api('/eventos/fontes/upload-logo'),
      form
    );
  }

  private toBody(payload: Partial<EventoFontePayload>): Record<string, unknown> {
    const body: Record<string, unknown> = {};
    if (payload.codigo !== undefined) body['codigo'] = payload.codigo;
    if (payload.nome !== undefined) body['nome'] = payload.nome;
    if (payload.url !== undefined) body['url'] = payload.url;
    if (payload.parserTipo !== undefined) body['parserTipo'] = payload.parserTipo;
    if (payload.ativo !== undefined) body['ativo'] = payload.ativo;
    if (payload.ordem !== undefined) body['ordem'] = payload.ordem;
    if (payload.limite !== undefined) body['limite'] = payload.limite;
    if (payload.logoUrl !== undefined) body['logoUrl'] = payload.logoUrl;
    if (payload.rotulo !== undefined) body['rotulo'] = payload.rotulo;
    return body;
  }
}
