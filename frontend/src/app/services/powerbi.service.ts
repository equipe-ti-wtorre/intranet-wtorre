import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { PowerBiEmbedToken, PowerBiReportListItem } from '../models/powerbi.model';

@Injectable({ providedIn: 'root' })
export class PowerBiService {
  private readonly http = inject(HttpClient);

  private api(path: string): string {
    return `${environment.apiBaseUrl}/powerbi${path}`;
  }

  listarReports(): Observable<PowerBiReportListItem[]> {
    return this.http.get<PowerBiReportListItem[]>(this.api('/reports'));
  }

  obterEmbedToken(reportId: string): Observable<PowerBiEmbedToken> {
    return this.http.get<PowerBiEmbedToken>(this.api(`/reports/${encodeURIComponent(reportId)}/embed-token`));
  }
}
