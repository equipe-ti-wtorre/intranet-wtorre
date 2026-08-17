import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  BidEventosAbertosResponse,
  BidIntegracaoConfig,
  BidMeusPremiosResponse,
  BidTesteConexaoResponse,
  SalvarBidIntegracaoBody,
} from '../models/bid.model';

@Injectable({ providedIn: 'root' })
export class BidService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/bid`;
  private readonly configBase = `${environment.apiBaseUrl}/configuracoes/bid`;

  getEventosAbertos(): Observable<BidEventosAbertosResponse> {
    return this.http.get<BidEventosAbertosResponse>(`${this.base}/eventos-abertos`);
  }

  getMeusPremios(): Observable<BidMeusPremiosResponse> {
    return this.http.get<BidMeusPremiosResponse>(`${this.base}/meus-premios`);
  }

  getIntegracaoConfig(): Observable<BidIntegracaoConfig> {
    return this.http.get<BidIntegracaoConfig>(this.configBase);
  }

  salvarIntegracaoConfig(body: SalvarBidIntegracaoBody): Observable<BidIntegracaoConfig> {
    return this.http.put<BidIntegracaoConfig>(this.configBase, body);
  }

  testarIntegracao(): Observable<BidTesteConexaoResponse> {
    return this.http.post<BidTesteConexaoResponse>(`${this.configBase}/testar`, {});
  }
}
