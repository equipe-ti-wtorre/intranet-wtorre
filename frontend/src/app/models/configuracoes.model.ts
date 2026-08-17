export interface HeaderChamadoConfig {
  label: string;
  url: string | null;
  ativo: boolean;
  abrir_nova_aba: boolean;
  tipo_destino: 'interna' | 'externa';
}

export type EmailProvider = 'smtp' | 'acs';

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  has_password: boolean;
  from_email: string;
  from_name: string;
  ativo: boolean;
  atualizado_em?: string;
}

export interface EmailConfig extends SmtpConfig {
  provider: EmailProvider;
  has_acs_connection_string: boolean;
  acs_sender: string;
  ocultar_para: boolean;
}

export interface ConfiguracoesAdmin {
  header_chamado: HeaderChamadoConfig;
}

export interface BidIntegracaoConfig {
  ativo: boolean;
  api_base_url: string;
  has_api_key: boolean;
  api_key_hint: string | null;
  app_url: string;
  cache_ttl_min: number;
  sync_automatica: boolean;
  sync_intervalo_min: number;
  ultima_sync?: string | null;
  ultima_sync_erro?: string | null;
  snapshot_status?: 'ok' | 'erro' | null;
  snapshot_sincronizado_em?: string | null;
  gerado_em_eventos?: string | null;
  gerado_em_usuarios?: string | null;
  atualizado_em?: string;
}

export interface SalvarBidIntegracaoBody {
  ativo: boolean;
  api_base_url: string;
  api_key?: string;
  app_url: string;
  cache_ttl_min: number;
  sync_automatica: boolean;
  sync_intervalo_min: number;
}

export interface BidTesteConexaoResponse {
  ok: boolean;
  mensagem: string;
  bids_abertos: number;
  usuarios_ativos: number;
  gerado_em_eventos?: string | null;
  gerado_em_usuarios?: string | null;
}

export interface BidSincronizarResponse {
  ok: boolean;
  mensagem: string;
  bids_abertos: number;
  usuarios_ativos: number;
  gerado_em_eventos: string | null;
  gerado_em_usuarios: string | null;
  sincronizado_em: string | null;
  duracao_ms: number;
}
