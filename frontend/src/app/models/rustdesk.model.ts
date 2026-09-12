export type RustdeskEstado = 'sem_servico' | 'nunca_registrou' | 'no_servidor' | 'ausente_hbbs';

export interface RustdeskDispositivo {
  id: number;
  rustdesk_id: string;
  hostname: string | null;
  entidade_id: number | null;
  entidade_nome: string | null;
  setor: string | null;
  tipo: string | null;
  localizacao: string | null;
  modo_acesso: string | null;
  cofre_ref: string | null;
  servico_estado: string | null;
  versao_cliente: string | null;
  observacao: string | null;
  criado_em_hbbs: string | null;
  ultimo_registro: string | null;
  presente_no_hbbs: boolean;
  estado: RustdeskEstado;
  ativo: boolean;
  criado_em: string | null;
  atualizado_em: string | null;
}

export interface RustdeskDispositivoPayload {
  rustdesk_id?: string;
  hostname?: string | null;
  entidade_id?: number | null;
  setor?: string | null;
  tipo?: string | null;
  localizacao?: string | null;
  modo_acesso?: string | null;
  cofre_ref?: string | null;
  servico_estado?: string | null;
  versao_cliente?: string | null;
  observacao?: string | null;
  ativo?: boolean;
}

export interface RustdeskDispositivosLista {
  total: number;
  page: number;
  pageSize: number;
  itens: RustdeskDispositivo[];
}

export interface RustdeskOrfao {
  rustdesk_id: string;
  criado_em_hbbs: string | null;
  ultimo_registro: string | null;
  primeiro_visto_em: string | null;
  atualizado_em: string | null;
}

export interface RustdeskSyncLog {
  id: number;
  iniciado_em: string;
  finalizado_em: string | null;
  sucesso: boolean;
  peers_lidos: number;
  dispositivos_atualizados: number;
  orfaos_novos: number;
  mensagem_erro: string | null;
}

export interface RustdeskContainerMetricas {
  memoria_bytes: number | null;
  memoria_mb: number | null;
  ativo: boolean | null;
}

export interface RustdeskMetricas {
  disponivel: boolean;
  motivo: string | null;
  mensagem: string | null;
  coletado_em: string | null;
  defasagem_segundos: number | null;
  containers: {
    hbbs: RustdeskContainerMetricas;
    hbbr: RustdeskContainerMetricas;
  } | null;
  relay: {
    sessoes_ativas: number | null;
    egress_bytes_acumulado: number | null;
  } | null;
  host: {
    uptime_segundos: number | null;
    carga_media_1min: number | null;
  } | null;
}

export interface RustdeskResumo {
  bridge: {
    alcancavel: boolean;
    ok: boolean | null;
    sqlite_acessivel: boolean | null;
    total_peers: number | null;
    metricas_disponiveis: boolean | null;
    versao: string | null;
    mensagem: string | null;
  };
  stats: {
    total: number;
    registrados_ultima_hora: number;
    mais_antigo: string | null;
    mais_recente: string | null;
  } | null;
  metricas: RustdeskMetricas;
  sync: RustdeskSyncLog | null;
}

export interface RustdeskSyncResultado {
  ok: boolean;
  mensagem: string;
  log: RustdeskSyncLog | null;
}

export interface RustdeskCsvResultado {
  criados: number;
  atualizados: number;
  ignorados: number;
  erros: { linha: number; rustdesk_id: string; mensagem: string }[];
}
