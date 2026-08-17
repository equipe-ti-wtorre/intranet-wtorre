import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  SalasAdminRoomsResponse,
  SalasRegisteredLogosResponse,
  SalasAdminUiConfig,
  SalasAdminUiConfigResponse,
  SalasIntegracaoConfig,
  SalasTesteConexaoResponse,
  SalvarSalasIntegracaoBody,
} from '../models/salas-config.model';

@Injectable({ providedIn: 'root' })
export class SalasConfigService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/salas`;

  getConfig(): Observable<SalasIntegracaoConfig> {
    return this.http.get<SalasIntegracaoConfig>(`${this.base}/config`);
  }

  saveConfig(body: SalvarSalasIntegracaoBody): Observable<SalasIntegracaoConfig> {
    return this.http.put<SalasIntegracaoConfig>(`${this.base}/config`, body);
  }

  testarConexao(body: Partial<SalvarSalasIntegracaoBody>): Observable<SalasTesteConexaoResponse> {
    return this.http.post<SalasTesteConexaoResponse>(`${this.base}/config/testar`, body);
  }

  getAdminUiConfig(): Observable<SalasAdminUiConfigResponse> {
    return this.http.get<SalasAdminUiConfigResponse>(`${this.base}/admin/ui-config`);
  }

  getAdminRooms(): Observable<SalasAdminRoomsResponse> {
    return this.http.get<SalasAdminRoomsResponse>(`${this.base}/admin/rooms`);
  }

  getAdminLogos(): Observable<SalasRegisteredLogosResponse> {
    return this.http.get<SalasRegisteredLogosResponse>(`${this.base}/admin/logos`);
  }

  saveAdminUiConfig(config: SalasAdminUiConfig): Observable<SalasAdminUiConfigResponse> {
    return this.http.put<SalasAdminUiConfigResponse>(`${this.base}/admin/ui-config`, config);
  }

  uploadTabLogo(tabId: string, file: File): Observable<SalasAdminUiConfigResponse> {
    const formData = new FormData();
    formData.append('logo', file);
    return this.http.post<SalasAdminUiConfigResponse>(
      `${this.base}/admin/tabs/${encodeURIComponent(tabId)}/logo`,
      formData
    );
  }

  deleteTabLogo(tabId: string): Observable<SalasAdminUiConfigResponse> {
    return this.http.delete<SalasAdminUiConfigResponse>(
      `${this.base}/admin/tabs/${encodeURIComponent(tabId)}/logo`
    );
  }

  logoUrl(logoFile: string): string {
    return `${this.base}/logos/${encodeURIComponent(logoFile)}`;
  }
}
