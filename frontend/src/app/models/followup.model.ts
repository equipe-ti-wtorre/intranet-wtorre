export type FollowupFamilia = 'ok' | 'wait' | 'bad' | 'info';

export interface FollowupSolicitacao {
  id: number;
  n_requisicao: number;
  requisitante: string | null;
  usuario: string;
  status_geral: string | null;
  tipo_documento: string | null;
  pedido_contrato: string | null;
  fornecedor: string | null;
  valor_total_pedido: number | null;
  saldo_pedido: number | null;
  data_emissao_pedido: string | null;
  data_aprovacao_rm: string | null;
  mapa_cotacao: string | null;
  numero_approvo: string | null;
  centro_custo: string | null;
  nome_filial: string | null;
  cod_filial: string | null;
  sincronizado_em: string | null;
  mensagem: string;
  familia: FollowupFamilia;
}

export interface FollowupFilial {
  codigo: string;
  nome: string | null;
}

export interface FollowupResumoItem {
  status: string;
  qtd: number;
  familia: FollowupFamilia;
}

export interface FollowupConfig {
  id: number;
  sharepoint_url: string | null;
  hostname?: string | null;
  site_path?: string | null;
  biblioteca?: string | null;
  arquivo_caminho?: string | null;
  item_id?: string | null;
  aba_rm: string;
  aba_matriz: string;
  sync_automatica: boolean;
  sync_intervalo_min: number;
  ultima_sync: string | null;
  ultima_sync_status: string | null;
  ultima_sync_linhas: number | null;
  ultima_sync_erro: string | null;
  atualizado_em: string | null;
}

export interface FollowupSyncLog {
  id: number;
  iniciado_em: string;
  finalizado_em: string | null;
  status: 'sucesso' | 'erro';
  linhas_importadas: number;
  mensagem_erro: string | null;
}

export interface FollowupStatusSync {
  sync_em_andamento: boolean;
  ultima_sync: string | null;
  ultima_sync_status: string | null;
  ultima_sync_linhas: number | null;
  ultima_sync_erro: string | null;
  sync_automatica: boolean;
  sync_intervalo_min: number;
  ultimo_log: FollowupSyncLog | null;
}

export interface FollowupTestePasso {
  passo: string;
  ok: boolean;
  detalhe: string;
}

export interface FollowupTesteConexao {
  ok: boolean;
  passos: FollowupTestePasso[];
  erro?: string;
  headers?: unknown;
}

export interface FollowupSyncResumo {
  status: string;
  linhas_importadas: number;
  linhas_lidas: number;
  matriz_itens: number;
  duracao_ms: number;
  ultima_sync: string | null;
}
