export type NscStatus =
  | 'pendente'
  | 'valido'
  | 'a_vencer'
  | 'vencido'
  | 'nao_obrigatorio'
  | 'aguardando_aprovacao';

export type NscAprovacaoStatus = 'aprovado' | 'pendente' | 'rejeitado';

export type NscOverride = boolean | null;

export type NscPerfilAcesso = 'total' | 'gestor';

export type NscEscopoAcesso = 'global' | 'recorte' | 'departamentos' | 'proprio_departamento';

export interface NscAcessoPermissoes {
  baixar: boolean;
  exportar: boolean;
  lembrar: boolean;
  aprovar: boolean;
}

export interface NscAcesso {
  pode_visualizar: boolean;
  pode_ver_equipe?: boolean;
  escopo?: NscEscopoAcesso | null;
  departamentos?: string[];
  empresas?: string[];
  permissoes?: NscAcessoPermissoes;
  grupo_nome?: string | null;
  label_escopo?: string | null;
}

export interface NscEquipeKpis {
  obrigatorios: number;
  vigentes: number;
  validos: number;
  a_vencer: number;
  vencidos: number;
  pendentes: number;
  sem_certificado: number;
  aguardando_aprovacao?: number;
}

export interface NscEquipeResposta {
  acesso: NscAcesso;
  kpis: NscEquipeKpis;
  departamentos: string[];
  colaboradores: NscColaboradorAdmin[];
  total: number;
}

export interface NscVisualizador {
  id: number | null;
  ad_object_id: string;
  nome: string | null;
  email: string | null;
  perfil: NscPerfilAcesso;
  departamentos: string[];
  empresas: string[];
  origem?: 'manual' | 'departamento';
}

export interface NscAcessoLog {
  id: number;
  usuario_id: number | null;
  usuario_email: string | null;
  usuario_nome: string | null;
  acao: string;
  alvo_ad_object_id: string | null;
  alvo_nome: string | null;
  detalhe: string | null;
  criado_em: string | null;
}

export interface NscEnvio {
  id: number;
  nome_arquivo: string;
  mime: string;
  tamanho: number;
  data_emissao: string | null;
  validade: string | null;
  nome_lido?: string | null;
  enviado_em: string | null;
  vigente: boolean;
  aprovacao?: NscAprovacaoStatus;
  motivo_rejeicao?: string | null;
  motivo_aprovacao?: string | null;
}

export interface NscPedidoAprovacao {
  id: number;
  nome_lido: string | null;
  data_emissao: string | null;
  enviado_em: string | null;
  motivo_aprovacao?: string | null;
  motivo_rejeicao?: string | null;
}

export interface NscValidacao {
  ok: boolean;
  nome_lido: string;
  colaborador_nome: string;
  data_emissao: string | null;
  validade: string | null;
  nome_confere: boolean;
  requer_aprovacao: boolean;
  requer_data_manual?: boolean;
  mensagem?: string;
}

export interface NscAprovacaoItem extends NscEnvio {
  ad_object_id: string;
  colaborador_nome: string | null;
  colaborador_email: string | null;
  departamento: string | null;
  cargo: string | null;
}

export interface NscMeu {
  ad_object_id: string;
  nome: string;
  cargo: string | null;
  departamento: string | null;
  email: string | null;
  obrigatorio_efetivo: boolean;
  obrigatorio_override: boolean | null;
  status: NscStatus;
  validade_efetiva: string | null;
  data_emissao: string | null;
  validade_manual: string | null;
  dias_restantes: number | null;
  irregular: boolean;
  atualizado_em: string | null;
  arquivo_id: number | null;
  permitir_validade_manual: boolean;
  link_renovacao: string;
  link_portal: string;
  link_canal: string;
  aprovacao_pendente?: boolean;
  nome_lido_pendente?: string | null;
  pedido_aprovacao?: NscPedidoAprovacao | null;
  pedido_rejeitado?: NscPedidoAprovacao | null;
  historico: NscEnvio[];
}

export interface NscColaboradorAdmin {
  ad_object_id: string;
  nome: string;
  cargo: string | null;
  departamento: string | null;
  empresa?: string | null;
  email: string | null;
  obrigatorio_efetivo: boolean;
  obrigatorio_override: boolean | null;
  status: NscStatus;
  validade_efetiva: string | null;
  data_emissao: string | null;
  dias_restantes: number | null;
  irregular: boolean;
  atualizado_em: string | null;
  arquivo_id?: number | null;
}

export interface NscColaboradoresResposta {
  colaboradores: NscColaboradorAdmin[];
}

export interface NscResumoDepartamento {
  departamento: string;
  obrigatorios: number;
  validos: number;
  a_vencer: number;
  vencidos: number;
  pendentes: number;
  aguardando_aprovacao?: number;
  irregulares: number;
}

export interface NscResumo {
  obrigatorios: number;
  validos: number;
  a_vencer: number;
  vencidos: number;
  pendentes: number;
  aguardando_aprovacao?: number;
  irregulares: number;
  por_departamento?: NscResumoDepartamento[];
}

export interface NscGestorDepartamento {
  ad_object_id: string;
  nome: string | null;
  email: string | null;
  cargo: string | null;
}

export interface NscRegraDepartamento {
  departamento_ou: string;
  obrigatorio: boolean;
  gestores?: NscGestorDepartamento[];
}

export interface NscConfig {
  meses_validade_padrao: number;
  antecedencias_aviso: number[];
  notificar_colaborador: boolean;
  notificar_gestor: boolean;
  resumo_semanal_rh: boolean;
  sinalizar_operacao: boolean;
  permitir_validade_manual: boolean;
  emails_rh: string[];
}

export interface NscPreviewNotificacao {
  tipo: string;
  assunto: string;
  html: string;
}

export interface NscNotificacaoLog {
  id: number;
  ad_object_id: string;
  tipo: string;
  destinatario: string;
  enviado_em: string;
  status: string;
  colaborador_nome: string | null;
  departamento: string | null;
}

export interface NscCertificadoDetalhe {
  colaborador: NscColaboradorAdmin;
  vigente: NscEnvio | null;
  historico: NscEnvio[];
}
