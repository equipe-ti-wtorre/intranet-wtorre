import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { EmailConfig, HeaderChamadoConfig, SmtpConfig, BidIntegracaoConfig, SalvarBidIntegracaoBody, BidTesteConexaoResponse, BidSincronizarResponse } from '../models/configuracoes.model';

export interface SalvarEmailBody {
  provider: 'smtp' | 'acs';
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password?: string;
  from_email: string;
  from_name: string;
  acs_connection_string?: string;
  acs_sender: string;
  ocultar_para: boolean;
  ativo: boolean;
}

@Injectable({ providedIn: 'root' })
export class ConfiguracoesService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/configuracoes`;

  /** Leitura pública do botão do header (consumido pelo HeaderComponent). */
  getHeaderChamado(): Observable<HeaderChamadoConfig> {
    return this.http.get<HeaderChamadoConfig>(`${this.base}/header-chamado`);
  }

  getEmail(): Observable<EmailConfig> {
    return this.http.get<EmailConfig>(`${this.base}/email`);
  }

  salvarEmail(body: SalvarEmailBody): Observable<EmailConfig> {
    return this.http.put<EmailConfig>(`${this.base}/email`, body);
  }

  verificarEmail(): Observable<{ ok: boolean; mensagem: string }> {
    return this.http.post<{ ok: boolean; mensagem: string }>(`${this.base}/email/verificar`, {});
  }

  enviarTesteEmail(destinatario?: string): Observable<{ ok: boolean; mensagem: string }> {
    return this.http.post<{ ok: boolean; mensagem: string }>(`${this.base}/email/teste`, {
      to: destinatario,
    });
  }

  /** @deprecated Use getEmail() */
  getSmtp(): Observable<SmtpConfig> {
    return this.getEmail();
  }

  /** @deprecated Use salvarEmail() */
  salvarSmtp(body: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    password?: string;
    from_email: string;
    from_name: string;
    ativo: boolean;
  }): Observable<SmtpConfig> {
    return this.salvarEmail({
      provider: 'smtp',
      ...body,
      acs_sender: '',
      ocultar_para: false,
    });
  }

  /** @deprecated Use verificarEmail() */
  verificarSmtp(): Observable<{ ok: boolean; mensagem: string }> {
    return this.verificarEmail();
  }

  /** @deprecated Use enviarTesteEmail() */
  enviarTesteSmtp(destinatario?: string): Observable<{ ok: boolean; mensagem: string }> {
    return this.enviarTesteEmail(destinatario);
  }

  getBidIntegracao(): Observable<BidIntegracaoConfig> {
    return this.http.get<BidIntegracaoConfig>(`${this.base}/bid`);
  }

  salvarBidIntegracao(body: SalvarBidIntegracaoBody): Observable<BidIntegracaoConfig> {
    return this.http.put<BidIntegracaoConfig>(`${this.base}/bid`, body);
  }

  testarBidIntegracao(): Observable<BidTesteConexaoResponse> {
    return this.http.post<BidTesteConexaoResponse>(`${this.base}/bid/testar`, {});
  }

  sincronizarBidIntegracao(): Observable<BidSincronizarResponse> {
    return this.http.post<BidSincronizarResponse>(`${this.base}/bid/sincronizar`, {});
  }
}
