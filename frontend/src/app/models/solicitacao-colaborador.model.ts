export type SolicitacaoTipo = 'novo' | 'reposicao' | 'mudanca';
export type SolicitacaoEquipamento = 'desktop' | 'notebook' | 'nao';
export type SolicitacaoStatus = 'recebida' | 'enviada' | 'parcial' | 'erro';

export interface SolicitacaoCampoOpcao {
  valor: string;
  label: string;
}

export interface SolicitacaoCampoCondicional {
  quando: string;
  valor: boolean;
}

export interface SolicitacaoCampo {
  chave: string;
  label: string;
  tipo: 'text' | 'email' | 'date' | 'bool' | 'enum' | 'file' | 'cpf';
  obrigatorio?: boolean;
  sensivel?: boolean;
  anexo?: boolean;
  opcoes?: SolicitacaoCampoOpcao[];
  condicional?: SolicitacaoCampoCondicional;
}

export interface SolicitacaoAcesso {
  pode_visualizar: boolean;
}

export interface SolicitacaoColaborador {
  id: number;
  solicitante_usuario_id?: number | null;
  solicitante_nome: string;
  solicitante_email: string;
  tipo: SolicitacaoTipo;
  nome: string;
  sobrenome: string;
  email_novo?: string | null;
  data_nascimento?: string | null;
  cpf?: string | null;
  rg?: string | null;
  departamento?: string | null;
  cargo?: string | null;
  supervisor?: string | null;
  centro_custo?: string | null;
  empresa?: string | null;
  local_trabalho?: string | null;
  foto_url?: string | null;
  boas_vindas_url?: string | null;
  credencial_veiculo_url?: string | null;
  precisa_ramal: boolean;
  precisa_celular: boolean;
  equipamento: SolicitacaoEquipamento;
  credencial_estacionamento: boolean;
  data_inicio?: string | null;
  status: SolicitacaoStatus;
  criado_em?: string;
}

export interface SolicitacaoGrupo {
  id: number;
  nome: string;
  destinatarios: string[];
  campos: string[];
  assunto?: string | null;
  ativo: boolean;
  ordem: number;
  criado_em?: string;
}

export interface SolicitacaoEmailIndividual {
  id: number;
  nome?: string | null;
  email: string;
  assunto?: string | null;
  campos: string[];
  ativo: boolean;
  ordem: number;
  criado_em?: string;
}

export interface SolicitacaoEnvio {
  id: number;
  solicitacao_id: number;
  grupo_id?: number | null;
  email_individual_id?: number | null;
  grupo_nome: string;
  destinatarios: string[];
  status: 'ok' | 'erro';
  erro?: string | null;
  message_id?: string | null;
  enviado_em?: string;
}

export interface UsuarioAdBusca {
  id: number;
  nome: string;
  email: string | null;
  departamento: string | null;
  empresa: string | null;
}

export interface SolicitacaoVisualizador {
  usuario_id: number;
  nome_completo: string;
  email: string;
  departamento?: string | null;
  criado_em?: string;
}

export interface SolicitacaoCriarResposta {
  solicitacao: SolicitacaoColaborador;
  envio: {
    grupos: { grupo_id: number; grupo_nome: string; status: string; erro?: string | null }[];
    status: SolicitacaoStatus;
    aviso?: string;
  };
}

export interface SolicitacaoDetalheAdmin {
  solicitacao: SolicitacaoColaborador;
  envios: SolicitacaoEnvio[];
}
