export interface Colaborador {
  id: number;
  nome: string;
  cargo: string | null;
  departamento: string | null;
  email: string | null;
  celular: string | null;
  ramal: string | null;
  telefone_fixo?: string | null;
  nasc_dia?: number | null;
  nasc_mes?: number | null;
  empresa: string | null;
  tenant_id: number | null;
  /** null = desconhecido; false = sem foto confirmada; true = com foto */
  tem_foto: boolean | null;
}

export type PendenciaCampo =
  | 'cargo'
  | 'empresa'
  | 'ramal'
  | 'celular'
  | 'telefone_fixo'
  | 'aniversario'
  | 'sem_contato';

export type ComSemFiltro = 'com' | 'sem';

export interface ColaboradorTenantFiltro {
  id: number;
  nome: string;
}

export interface ColaboradoresAdminFiltrosOpcoes {
  empresas: string[];
  departamentos: string[];
  tenants: ColaboradorTenantFiltro[];
}

export interface ColaboradorIntranetLink {
  cadastrado: boolean;
  usuario_id: number | null;
}

export interface ColaboradorAdmin extends Colaborador {
  ad_id?: string;
  ativo: boolean;
  sincronizado_em: string | null;
  nasc_ano?: number | null;
  tenant_nome?: string | null;
  intranet: ColaboradorIntranetLink;
  pendencias?: PendenciaCampo[];
}

export interface ColaboradoresAdminResposta {
  colaboradores: ColaboradorAdmin[];
  total: number;
  page: number;
  limit: number;
}

export interface ColaboradoresStats {
  ativos: number;
  inativos: number;
  ultima_sync: string | null;
  sync_em_andamento: boolean;
  incompletos_ativos: number;
}

export interface ColaboradoresSyncResumo {
  tenants: {
    tenant: string;
    tenant_id: number;
    sincronizados: number;
    inativados: number;
    ignorados: number;
    erro?: string;
  }[];
  total: number;
  erros: { tenant: string; mensagem: string }[];
  duracao_ms?: number;
  sincronizado_em?: string | null;
}

export interface ColaboradoresAdminFiltros {
  busca?: string;
  empresa?: string;
  departamento?: string;
  ativo?: '1' | '0' | 'todos';
  tenant_id?: number;
  intranet?: ComSemFiltro;
  cargo?: ComSemFiltro;
  empresa_status?: ComSemFiltro;
  incompletos?: boolean;
  page?: number;
  limit?: number;
}

export type ColaboradorImportCampo =
  | 'cargo'
  | 'departamento'
  | 'celular'
  | 'telefone_fixo'
  | 'ramal'
  | 'aniversario';

export interface ColaboradorGraphUpdatePayload {
  cargo?: string | null;
  departamento?: string | null;
  celular?: string | null;
  telefone_fixo?: string | null;
  ramal?: string | null;
  aniversario?: string | null;
}

export interface ColaboradorImportAlteracao {
  campo: ColaboradorImportCampo;
  de: string | null;
  para: string | null;
}

export interface ColaboradorImportLinha {
  linha: number;
  ad_id: string | null;
  nome: string | null;
  email: string | null;
  alteracoes: ColaboradorImportAlteracao[];
  erros: string[];
  aplicavel: boolean;
}

export interface ColaboradoresImportPreviewResposta {
  linhas: ColaboradorImportLinha[];
  resumo: {
    total: number;
    com_alteracoes: number;
    com_erros: number;
    aplicaveis: number;
  };
}

export interface ColaboradoresImportErro {
  linha: number | null;
  ad_id: string | null;
  mensagem: string;
}

export interface ColaboradoresImportAplicarResposta {
  aplicados: number;
  ignorados: number;
  erros: ColaboradoresImportErro[];
  sync?: ColaboradoresSyncResumo | null;
}

export interface ColaboradorGraphUpdateResposta {
  alterado: boolean;
  alteracoes: ColaboradorImportAlteracao[];
  colaborador: ColaboradorAdmin;
}

export interface DiretorioResposta {
  colaboradores: Colaborador[];
  sincronizado_em: string | null;
}

export type EmpresaClasse = 'wtorre' | 'nubank' | 'base' | 'novo' | 'neutro';

export interface Aniversariante {
  id: number;
  nome: string;
  cargo: string | null;
  departamento: string | null;
  empresa: string | null;
  nasc_dia: number;
  nasc_mes: number;
  tem_foto: boolean | null;
}

export interface AniversariantesResposta {
  aniversariantes: Aniversariante[];
  mes: number;
}
