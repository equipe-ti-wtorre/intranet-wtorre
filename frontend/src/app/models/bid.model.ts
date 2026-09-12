export type BidEventoSituacao = 'aberta' | 'encerrada' | 'vencedor';

export interface BidEventoCarrossel {
  id: number;
  titulo: string;
  subtitulo: string | null;
  local: string | null;
  imagem_url: string | null;
  data_jogo: string | null;
  data_limite_aposta: string | null;
  data_apuracao?: string | null;
  quantidade_premios: number;
  setor_evento_nome: string | null;
  grupo_id: number | null;
  nome_grupo: string | null;
  situacao: BidEventoSituacao;
  lance_vencedor?: number;
  data_aposta?: string | null;
  quantidade_ingressos?: number;
  total_apostas?: number;
  total_participantes?: number;
  cta_url: string;
}

/** @deprecated Use BidEventoCarrossel */
export type BidEventoAberto = BidEventoCarrossel;

export interface BidEventosAbertosResponse {
  gerado_em: string;
  eventos: BidEventoCarrossel[];
}

export interface BidMeusPremiosResponse {
  gerado_em: string;
  premios: BidPremio[];
}

export interface BidVencedorTicketData {
  titulo: string;
  subtitulo: string | null;
  local: string | null;
  setor_evento_nome: string | null;
  imagem_url?: string | null;
  data_jogo: string | null;
  data_aposta: string | null;
  lance: number;
  quantidade_ingressos?: number;
  cta_url: string;
}

export interface BidPremio {
  partida_id: number;
  titulo: string;
  subtitulo: string | null;
  local: string | null;
  setor_evento_nome: string | null;
  imagem_url: string | null;
  data_jogo: string | null;
  data_apuracao: string | null;
  lance: number;
  data_aposta: string | null;
  quantidade_ingressos?: number;
  cta_url: string;
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
  gerado_em_eventos: string | null;
  gerado_em_usuarios: string | null;
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
