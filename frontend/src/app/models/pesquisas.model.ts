export type FormularioStatus = 'rascunho' | 'publicado' | 'encerrado';
export type FormularioTipo = 'basico' | 'avancado';
export type PublicoAlvo = 'todos' | 'departamento' | 'externos';
export type PerguntaTipo =
  | 'texto_curto'
  | 'texto_longo'
  | 'multipla_escolha'
  | 'escala'
  | 'sim_nao';
export type BlocoTipo = 'pergunta' | 'texto' | 'anexo';
export type CapaLayout = 'top' | 'bottom' | 'left' | 'right';
export type TextoEstilo = 'paragrafo' | 'titulo';
export type LogicaCondicao = 'qualquer' | 'sim' | 'nao' | 'escala_gte_4';
export type RequisicaoTipo = 'compra' | 'ti' | 'rh' | 'manutencao' | 'outro';
export type RequisicaoPrioridade = 'baixa' | 'media' | 'alta';
export type RequisicaoStatus =
  | 'rascunho'
  | 'pendente'
  | 'em_andamento'
  | 'concluida'
  | 'rejeitada';
export type BadgeStatus = 'pending' | 'done' | 'draft' | 'review';
export type ListaTipo =
  | 'form-pending'
  | 'form-answered'
  | 'form-created'
  | 'req-pending'
  | 'req-answered'
  | 'req-created';

export interface PesquisasResumo {
  formPending: number;
  formAnswered: number;
  formCreated: number;
  reqPending: number;
  reqAnswered: number;
  reqCreated: number;
  itensCriados: number;
  publicados: number;
  rascunhos: number;
  respostasRecebidas: number;
}

export interface PesquisasListItem {
  id: number;
  kind: 'formulario' | 'requisicao';
  title: string;
  category: string;
  date: string;
  status: BadgeStatus;
  formStatus?: FormularioStatus;
  reqStatus?: RequisicaoStatus;
  tipo?: string;
  totalRespostas?: number;
  publicoAlvoTotal?: number;
  prioridade?: RequisicaoPrioridade;
  criadorNome?: string;
  aprovadorNome?: string;
  prazo?: string | null;
  criadoEm?: string | null;
  createdDate?: string | null;
  publicoAlvo?: PublicoAlvo;
  publicoDepartamento?: string | null;
  slug?: string | null;
  eventoAtivo?: boolean;
  eventoTipo?: string | null;
  totalConvidados?: number;
  janela?: 'antes' | 'depois' | null;
}

export interface PesquisasLogica {
  perguntaOrdem: number;
  condicao: LogicaCondicao;
}

export interface PesquisasPergunta {
  id?: number;
  formularioId?: number;
  ordem: number;
  texto: string;
  tipo: PerguntaTipo;
  obrigatoria: boolean;
  opcoes: string[];
  secaoTitulo?: string | null;
  logica?: PesquisasLogica | null;
  blocoTipo?: BlocoTipo;
  ajuda?: string | null;
  novaLinha?: boolean;
  textoEstilo?: TextoEstilo;
}

export interface PesquisasConvidado {
  id?: number;
  nome: string;
  email: string;
  cpfMascara?: string;
}

export type EventoTipo = 'show' | 'jogo' | 'outro';

export interface PesquisasFormulario {
  id: number;
  criadorId: number;
  criadorNome?: string | null;
  titulo: string;
  descricao: string;
  categoria: string;
  prazo: string | null;
  prazoInicio?: string | null;
  prazoFim?: string | null;
  publicoAlvo: PublicoAlvo;
  publicoDepartamento: string | null;
  tipo: FormularioTipo;
  status: FormularioStatus;
  secoes: boolean;
  logicaCondicional: boolean;
  anonimo: boolean;
  slug?: string | null;
  eventoTipo?: EventoTipo | null;
  eventoTipoOutro?: string | null;
  eventoAtivo?: boolean;
  exigirIdentidade?: boolean;
  janela?: 'antes' | 'depois' | null;
  totalRespostas?: number;
  totalConvidados?: number;
  perguntas?: PesquisasPergunta[];
  convidados?: PesquisasConvidado[];
  templateCodigo?: string;
  template?: PesquisasTemplateVisual;
  capaUrl?: string | null;
  capaLayout?: CapaLayout;
  temCapa?: boolean;
}

export interface PesquisasTemplateVisual {
  id?: number;
  codigo: string;
  nome: string;
  wordmark: string;
  corPrimaria: string;
  corPrimariaEscura: string;
  raioPx: number;
  ativo?: boolean;
  ordem?: number;
}

export interface PesquisasResponderPayload {
  id: number;
  slug?: string;
  titulo: string;
  descricao: string;
  categoria: string;
  prazo: string | null;
  prazoInicio?: string | null;
  prazoFim?: string | null;
  anonimo: boolean;
  secoes: boolean;
  logicaCondicional: boolean;
  perguntas: PesquisasPergunta[];
  template?: PesquisasTemplateVisual;
  capaUrl?: string | null;
  capaLayout?: CapaLayout;
}

export interface PesquisasResultadoItem {
  valor: string;
  anexoUrl?: string | null;
  respondente: { nome: string; email: string } | null;
  enviadoEm: string | null;
}

export interface PesquisasResultadoPergunta extends PesquisasPergunta {
  total: number;
  agregados: { opcoes?: { valor: string; count: number }[]; media?: number; dist?: number[] };
  respostas: PesquisasResultadoItem[];
}

export interface PesquisasSerieDia {
  label: string;
  value: number;
}

export interface PesquisasRespondente {
  name: string;
  dept: string;
  date: string;
}

export interface PesquisasResultados {
  formulario: PesquisasFormulario;
  total: number;
  perguntas: PesquisasResultadoPergunta[];
  publicoAlvoTotal: number;
  pendentes: number;
  taxa: number;
  dailySeries: PesquisasSerieDia[];
  respondentes: PesquisasRespondente[];
}

export interface PesquisasMinhaResposta {
  title: string;
  sub: string;
  answers: { q: string; a: string }[];
}

export interface PesquisasRequisicao {
  id: number;
  criadorId: number;
  criadorNome: string | null;
  tipo: RequisicaoTipo;
  titulo: string;
  descricao: string;
  prioridade: RequisicaoPrioridade;
  prazo: string | null;
  aprovadorUsuarioId: number | null;
  aprovadorNome: string | null;
  aprovadorRotulo: string | null;
  observacoes: string;
  anexoNome: string | null;
  temAnexo: boolean;
  status: RequisicaoStatus;
  decididoEm: string | null;
  criadoEm: string | null;
}

export interface PesquisasAprovador {
  id: number;
  nome: string;
  email: string;
  departamento: string | null;
}

export interface PesquisasPublicoMeta {
  slug: string;
  titulo: string;
  descricao: string;
  status: FormularioStatus;
  eventoAtivo: boolean;
  exigirIdentidade: boolean;
  eventoTipo: EventoTipo | null;
  eventoTipoOutro: string | null;
  prazoInicio?: string | null;
  prazoFim?: string | null;
  template?: PesquisasTemplateVisual;
  capaUrl?: string | null;
  capaLayout?: CapaLayout;
}

export const PESQUISAS_CATEGORIAS = [
  'Satisfação geral',
  'Clima organizacional',
  'Evento interno',
  'Atendimento / TI',
  'Outro',
] as const;

export const PESQUISAS_LISTA_META: Record<
  ListaTipo,
  { parent: string; child: string; actionLabel: string; actionIcon: string }
> = {
  'form-pending': {
    parent: 'Formulários',
    child: 'Para responder',
    actionLabel: 'Responder',
    actionIcon: 'edit',
  },
  'form-answered': {
    parent: 'Formulários',
    child: 'Já respondido',
    actionLabel: 'Ver detalhes',
    actionIcon: 'eye',
  },
  'form-created': {
    parent: 'Formulários',
    child: 'Criados',
    actionLabel: 'Gerenciar',
    actionIcon: 'bar',
  },
  'req-pending': {
    parent: 'Requisições',
    child: 'Para responder',
    actionLabel: 'Responder',
    actionIcon: 'edit',
  },
  'req-answered': {
    parent: 'Requisições',
    child: 'Já respondido',
    actionLabel: 'Ver detalhes',
    actionIcon: 'eye',
  },
  'req-created': {
    parent: 'Requisições',
    child: 'Criados',
    actionLabel: 'Gerenciar',
    actionIcon: 'bar',
  },
};

export const STATUS_LABEL: Record<BadgeStatus, string> = {
  pending: 'Pendente',
  done: 'Concluído',
  draft: 'Rascunho',
  review: 'Em andamento',
};
