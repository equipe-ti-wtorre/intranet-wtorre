export interface MassagemEmpresa {
  id: string;
  nm: string;
  cor: string;
  email?: string;
  ativo?: boolean;
}

export interface MassagemLayoutChip {
  icone: string;
  texto: string;
}

export interface MassagemLayout {
  brandNome: string;
  brandIcone: string;
  home: {
    eyebrow: string;
    titulo: string;
    tituloComplemento: string;
    tituloDestaque: string;
    subtitulo: string;
    chips: MassagemLayoutChip[];
  };
}

export interface MassagemConfig {
  emailsTeste: string[];
  sessoesPunicao: number;
}

export interface MassagemPunicao {
  id: string;
  email: string;
  nome: string;
  eventoId: string | null;
  eventoNm: string;
  unidade: string;
  dataFalta: string;
  sessoesAplicadas: number;
  sessoesRestantes: number;
  sessoesConsumidas: number;
  liberaEm: string | null;
}

export interface MassagemPunicaoPublica {
  ativa: boolean;
  dataFalta: string;
  sessoesRestantes: number;
  sessoesAplicadas: number;
  liberaEm: string | null;
}

export type MassagemEmailTemplateCodigo =
  | 'disparo_evento'
  | 'reserva_confirmada'
  | 'cancelamento'
  | 'fila_vaga'
  | 'falta_admin'
  | 'lembrete';

export interface MassagemEmailTemplate {
  id: string;
  codigo: MassagemEmailTemplateCodigo | string;
  nome: string;
  assunto: string;
  html: string;
  texto?: string;
  ativo: boolean;
  criadoEm?: string;
  atualizadoEm?: string;
}

export interface MassagemEmailTemplateMetaItem {
  codigo: MassagemEmailTemplateCodigo | string;
  nome: string;
  placeholders: string[];
}

export interface MassagemEmailTemplateMeta {
  codigos: MassagemEmailTemplateMetaItem[];
}

export interface MassagemEmailTemplatePreview {
  assunto: string;
  html: string;
  texto?: string;
}

export interface MassagemEmailLista {
  id: string;
  empresaId: string;
  empresaNm: string;
  nome: string;
  descricao?: string;
  emailGrupo?: string;
  totalEmails: number;
  criadoEm?: string;
  atualizadoEm?: string;
}

export interface MassagemEmailListaItem {
  id: string;
  listaId: string;
  email: string;
  nome: string;
  criadoEm?: string;
}

export interface MassagemDisparoResult {
  ok: boolean;
  aceito?: boolean;
  enviados: number;
  erros?: Array<{ email: string; mensagem: string }>;
  destino?: string;
  totalDestinos?: number;
  modo?: string;
  codigoTemplate?: string;
  mensagem?: string;
}

export type MassagemEmailEnvioTipo =
  | 'disparo_evento'
  | 'reserva_confirmada'
  | 'cancelamento'
  | 'fila_vaga'
  | 'falta_admin'
  | 'lembrete';

export type MassagemEmailEnvioModo = 'lista' | 'teste' | 'direto';

export type MassagemEmailEnvioStatus = 'enviando' | 'ok' | 'parcial' | 'erro';

export interface MassagemEmailEnvioDestino {
  id: string;
  envioId: string;
  email: string;
  nome: string;
  status: 'enviado' | 'falha';
  erro: string;
  messageId?: string | null;
  enviadoEm?: string;
}

export interface MassagemEmailEnvio {
  id: string;
  tipo: MassagemEmailEnvioTipo | string;
  origem: string;
  modo: MassagemEmailEnvioModo | string;
  eventoId: string | null;
  eventoNm: string;
  eventoData: string;
  assunto: string;
  total: number;
  enviados: number;
  falhas: number;
  status: MassagemEmailEnvioStatus | string;
  criadoEm: string;
  destinos: MassagemEmailEnvioDestino[];
}

export interface MassagemOcupacao {
  total: number;
  ocupados: number;
  disponiveis: number;
  pct: number;
}

export interface MassagemPausa {
  nome: string;
  inicio: string;
  fim: string;
}

export interface MassagemEvento {
  id: string;
  nm: string;
  masso: string;
  local: string;
  unidade: string;
  data: string;
  horarios: string[];
  status: 'ativo' | 'inativo';
  duracaoMin: number;
  pausas?: MassagemPausa[];
  horarioInicio?: string | null;
  horarioFim?: string | null;
  ocupacao?: MassagemOcupacao;
  euNaFila?: boolean;
  reservasCount?: number;
  filaCount?: number;
}

export interface MassagemSlot {
  chave: string;
  hora: string;
  horaFim?: string;
  estado: 'disponivel' | 'ocupado' | 'minha' | 'encerrado' | 'pausa';
  nome?: string;
  email?: string;
  status?: string;
  observacao?: string;
}

export interface MassagemMinhaReserva {
  chave: string;
  eventoId: string;
  eventoNm: string;
  unidade: string;
  data: string;
  hora: string;
  status?: string;
}

export interface MassagemSlotsResponse {
  eventoId: string;
  data: string;
  slots: MassagemSlot[];
  naFila: number | null;
  filaTotal: number;
  minhaFilaId: string | null;
  minhaChave: string | null;
  jaTemReserva?: boolean;
  minhaReserva?: MassagemMinhaReserva | null;
  punicao?: MassagemPunicaoPublica | null;
}

export interface MassagemReservaItem {
  chave: string;
  eventoId: string;
  data: string;
  hora: string;
  status: string;
  observacao: string;
  evento: { id: string; nm: string; masso: string; local: string } | null;
}

export interface MassagemMinhasResponse {
  proximas: MassagemReservaItem[];
  historico: MassagemReservaItem[];
}

export interface MassagemFilaItem {
  id: string;
  evtId: string;
  email: string;
  nome: string;
  posicao?: number;
}

export interface MassagemDashboard {
  eventosAtivos: number;
  totalReservas: number;
  presentes: number;
  faltas: number;
  naFila: number;
  eventos: MassagemEvento[];
}

export interface MassagemAdminReserva {
  chave: string;
  eventoId: string;
  data: string;
  hora: string;
  email: string;
  nome: string;
  status: string;
  observacao?: string;
  punido?: boolean;
}

export interface MassagemTabletDay {
  evento: {
    id: string;
    nm: string;
    masso: string;
    local: string;
    unidade?: string;
    data: string;
  };
  data: string;
  stats: {
    presentes: number;
    faltas: number;
    confirmados: number;
    naFila: number;
  };
  items: Array<{
    chave: string;
    hora: string;
    horaFim?: string;
    nome: string | null;
    email: string | null;
    status: string;
    observacao: string;
  }>;
  fila: MassagemFilaItem[];
}
