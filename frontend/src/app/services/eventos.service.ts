import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, of, tap } from 'rxjs';
import { environment } from '../../environments/environment';
import { EventosAgendaResponse, EventosProximosResponse } from '../models/evento.model';
import {
  EventosAgendaCacheService,
} from './eventos-agenda-cache.service';

@Injectable({ providedIn: 'root' })
export class EventosService {
  private readonly http = inject(HttpClient);
  private readonly cache = inject(EventosAgendaCacheService);

  listarProximos(): Observable<EventosProximosResponse> {
    return this.http.get<EventosProximosResponse>(`${environment.apiBaseUrl}/eventos/proximos`);
  }

  listarAgenda(limite?: number): Observable<EventosAgendaResponse> {
    let params = new HttpParams();
    if (limite != null && Number.isFinite(limite)) {
      params = params.set('limite', String(limite));
    }
    return this.http.get<EventosAgendaResponse>(`${environment.apiBaseUrl}/eventos/agenda`, {
      params,
    });
  }

  listarAgendaMes(ano: number, mes: number, opts?: { force?: boolean }): Observable<EventosAgendaResponse> {
    const mesCal = mes + 1;
    const key = EventosAgendaCacheService.mesKey(ano, mesCal);
    if (!opts?.force) {
      const cached = this.cache.get(key);
      if (cached) {
        return of({
          eventos: cached.eventos,
          atualizadoEm: cached.atualizadoEm,
          fontes: [],
        });
      }
    }

    const params = new HttpParams()
      .set('ano', String(ano))
      .set('mes', String(mesCal))
      .set('limite', '200');

    return this.http
      .get<EventosAgendaResponse>(`${environment.apiBaseUrl}/eventos/agenda`, { params })
      .pipe(tap((res) => this.cache.set(key, res.eventos, res.atualizadoEm)));
  }

  listarAgendaIntervalo(
    de: string,
    ate: string,
    opts?: { force?: boolean }
  ): Observable<EventosAgendaResponse> {
    const key = EventosAgendaCacheService.intervaloKey(de, ate);
    if (!opts?.force) {
      const cached = this.cache.get(key);
      if (cached) {
        return of({
          eventos: cached.eventos,
          atualizadoEm: cached.atualizadoEm,
          fontes: [],
        });
      }
    }

    const params = new HttpParams().set('de', de).set('ate', ate).set('limite', '200');

    return this.http
      .get<EventosAgendaResponse>(`${environment.apiBaseUrl}/eventos/agenda`, { params })
      .pipe(tap((res) => this.cache.set(key, res.eventos, res.atualizadoEm)));
  }

  invalidarCacheAgenda(): void {
    this.cache.invalidateAll();
  }
}
