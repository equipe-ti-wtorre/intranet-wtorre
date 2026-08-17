export type TipoUnidade = 'camarote' | 'lounge';
export type SituacaoUnidade = 'vago' | 'vencido' | 'vence_breve' | 'ativo';
export type CadenciaAlerta = 'diaria' | 'semanal';
export type SyncFrequencia = '1h' | '6h' | '12h' | '24h' | 'semanal';
export type CamarotesTemplateCodigo = '90dias' | '30dias' | 'hoje';
export type CamarotesAba = 'alertas' | 'contratos' | 'usuarios' | 'sync' | 'disparos' | 'historico' | 'sharepoint';

export interface CamarotesGatilho {
  id?: number;
  dias: 90 | 30 | 0;
  template_codigo: CamarotesTemplateCodigo;
  assunto: string;
  ativo: boolean;
}

export interface CamaroteUnidade {
  id: number;
  tipo_unidade: TipoUnidade;
  andar: string | null;
  setor: string | null;
  numero: string;
  capacidade: number | null;
  cessionario: string | null;
  tipo_cessionario: string | null;
  primeira_locacao: string | null;
  inicio_locacao: string | null;
  final_locacao: string | null;
  dias_restantes?: number | null;
  valor_anual: number | null;
  valor_total: number | null;
  pack30: boolean;
  vagas_vvip: number | null;
  valor_vagas: number | null;
  situacao: SituacaoUnidade;
}

export interface SetorDisponiveis {
  numeros: string[];
  total: number;
}

export interface ResumoAlertas {
  vencidos: number;
  vence_30d: number;
  vence_breve: number;
  vagos: number;
  ativos: number;
  sem_data: number;
}

export interface MetricasFinanceiras {
  receita_anual: number;
  ticket_medio_anual: number;
  valor_medio_contrato: number;
  capacidade_total: number;
  media_por_unidade: number;
  qtd_ativos: number;
}

export interface TipoCessionarioResumo {
  resumo: Record<string, { quantidade: number; valor_total: number }>;
  por_andar: Record<string, Record<string, number>>;
}

export interface BlocoTipoUnidade {
  disponiveis_por_setor?: Record<string, SetorDisponiveis>;
  disponiveis?: number;
  alertas: ResumoAlertas;
  metricas: MetricasFinanceiras;
  tipo_cessionario: TipoCessionarioResumo;
  pack30: { com_pack30: number; sem_pack30: number };
  vagas_vvip: { total_vagas: number; valor_total: number };
}

export interface VencimentoMes {
  ym: string;
  label: string;
  qtd: number;
  venceBreve: boolean;
}

export interface VencimentosDashboard {
  vencidos: number;
  apos12m: number;
  refHoje: string;
  refLimite12m: string;
  meses: VencimentoMes[];
}

export interface ReceitaTrimestre {
  label: string;
  ano: number;
  tri: number;
  valor: number;
}

export interface ReceitaRenovarDashboard {
  total12m: number;
  vencida: number;
  trimestres: ReceitaTrimestre[];
}

export interface CamarotesDashboard {
  ultima_sync: string | null;
  dias_vence_breve: number;
  dias_vencimento_urgente: number;
  camarotes: BlocoTipoUnidade;
  vencimentos: VencimentosDashboard;
  receitaRenovar: ReceitaRenovarDashboard;
}

export interface CamarotesConfig {
  id: number;
  emails_alerta: string[];
  dias_vence_breve: number;
  cadencia: CadenciaAlerta;
  envio_ativo: boolean;
  sync_automatica: boolean;
  sync_frequencia: SyncFrequencia;
  ultimo_envio: string | null;
  ultima_sync: string | null;
  gatilhos?: CamarotesGatilho[];
  horario_envio?: string;
  envio_apos_sync?: boolean;
  sharepoint_url?: string | null;
  sharepoint_sheet?: string | null;
}

export interface CamarotesSyncLog {
  id: number;
  tipo_unidade: TipoUnidade;
  executado_em: string;
  linhas_lidas: number;
  linhas_gravadas: number;
  status: 'ok' | 'erro';
  erro: string | null;
  duracao_ms: number;
}

export interface SyncResumo {
  resultados: Array<{
    tipo_unidade: TipoUnidade;
    label: string;
    linhas_lidas?: number;
    linhas_gravadas?: number;
    duracao_ms?: number;
    status: string;
    mensagem?: string;
  }>;
  erros: Array<{ tipo_unidade: TipoUnidade; mensagem: string }>;
  duracao_ms: number;
  ultima_sync: string | null;
}

export interface CamarotesVisualizador {
  usuario_id: number;
  nome_completo: string;
  email: string;
  departamento?: string | null;
  criado_em?: string;
}

export interface CamarotesAcesso {
  pode_visualizar: boolean;
}

export interface CamarotesAlertasEnvioDestinatario {
  destinatario: string;
  status: 'pendente' | 'na_fila' | 'enviando' | 'enviado' | 'entregue' | 'bounce' | 'falha' | 'cancelado';
  erro?: string | null;
  provider?: 'smtp' | 'acs';
  message_id?: string | null;
  enviar_em?: string | null;
}

export type CamarotesStatusEntrega =
  | 'pendente'
  | 'na_fila'
  | 'enviando'
  | 'processando'
  | 'cancelado'
  | 'enviado'
  | 'entregue'
  | 'bounce'
  | 'falha'
  | 'parcial'
  | 'legado';

export interface CamarotesAlertasEnvioLog {
  id: number;
  gatilho_dias: number;
  final_locacao: string;
  enviado_em: string;
  numero: string;
  cessionario: string;
  status_entrega: CamarotesStatusEntrega;
  destinatarios: CamarotesAlertasEnvioDestinatario[];
}

export type CamarotesSituacaoEnvio = 'notificado' | 'no_prazo' | 'atrasado';

export interface CamarotesAlertaContrato {
  unidade_id: number;
  numero: string;
  cessionario: string;
  setor: string | null;
  andar: string | null;
  final_locacao: string;
  dias_restantes: number;
  gatilho_dias: 90 | 30 | 0;
  gatilho_ativo: boolean;
  notificado: boolean;
  notificado_em: string | null;
  situacao_envio: CamarotesSituacaoEnvio;
}

export interface CamarotesAlertasResumoGatilho {
  total: number;
  pendentes: number;
}

export interface CamarotesAlertasResumo {
  total: number;
  pendentes: number;
  g90: CamarotesAlertasResumoGatilho;
  g30: CamarotesAlertasResumoGatilho;
  g0: CamarotesAlertasResumoGatilho;
  vence_hoje: number;
  vencidos: number;
}

export interface CamarotesAlertasContratosResposta {
  total: number;
  pendentes: number;
  resumo: CamarotesAlertasResumo;
  itens: CamarotesAlertaContrato[];
}

export interface GatilhoPreviewResposta {
  html: string;
  subject: string;
  gatilho_dias: number;
}

export interface EnviarAlertasResposta {
  enviado?: boolean;
  preview?: boolean;
  html?: string;
  enviados?: number;
  erros?: Array<{ email: string; mensagem: string; numero?: string }>;
  gatilhos?: Array<{
    gatilho_dias: number;
    processados?: number;
    enviados?: number;
    ignorados?: number;
    erros?: Array<{ email: string; mensagem: string }>;
    itens?: Array<{ unidade_id: number; numero: string; assunto: string; html: string }>;
  }>;
  destinatarios?: string[];
  motivo?: string;
}

export interface EnviarResumoResposta extends EnviarAlertasResposta {}

export type EnvioAlertaItemStatus = 'pendente' | 'enviando' | 'sucesso' | 'falha' | 'ignorado';

export interface EnvioAlertaProgressItem {
  contrato: CamarotesAlertaContrato;
  status: EnvioAlertaItemStatus;
  mensagem?: string;
  erros?: Array<{ email: string; mensagem: string }>;
}

export interface EnvioAlertaProgressState {
  fase: 'preparando' | 'enviando' | 'concluido' | 'erro';
  total: number;
  concluidos: number;
  enviados: number;
  falhas: number;
  itens: EnvioAlertaProgressItem[];
  mensagemGlobal?: string;
  aguardandoServidor?: boolean;
  fila?: EnvioAlertaFilaItem[];
  filaResumo?: EnvioAlertaFilaResumo;
}

export type EnvioAlertaFilaStatus = 'pendente' | 'na_fila' | 'enviando' | 'enviado' | 'falha';

export interface EnvioAlertaFilaItem {
  id: string;
  unidade_id: number;
  numero: string;
  gatilho_dias: number;
  destinatario: string;
  status: EnvioAlertaFilaStatus;
  enviar_em?: string | null;
  enviado_em?: string | null;
  erro?: string | null;
  motivo_fila?: string | null;
}

export interface EnvioAlertaFilaResumo {
  total: number;
  pendente: number;
  na_fila: number;
  enviando: number;
  enviado: number;
  falha: number;
}

export interface EnvioAlertaJobResposta {
  aceito: boolean;
  status: 'iniciado' | 'em_andamento';
  job_key: string;
  total_enfileirados?: number;
  tentativa_em?: string | null;
}

export interface EnvioAlertaStatusResposta extends EnviarAlertasResposta {
  status: 'em_andamento' | 'concluido' | 'erro' | 'desconhecido';
  job_key?: string;
  mensagem?: string;
  fila?: EnvioAlertaFilaItem[];
  fila_resumo?: EnvioAlertaFilaResumo;
}
