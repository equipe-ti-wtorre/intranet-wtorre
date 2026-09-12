import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { FooterConfig } from '../models/rodape.model';

@Injectable({ providedIn: 'root' })
export class RodapeService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/rodape`;

  getFooter(): Observable<FooterConfig> {
    return this.http.get<FooterConfig>(this.base);
  }

  getAdmin(): Observable<FooterConfig> {
    return this.http.get<FooterConfig>(`${this.base}/admin`);
  }

  salvar(config: FooterConfig): Observable<FooterConfig> {
    return this.http.put<FooterConfig>(this.base, config);
  }
}
