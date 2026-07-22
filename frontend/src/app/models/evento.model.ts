export interface Evento {
  fonteCodigo: string;
  fonteNome: string;
  tipo: string;
  titulo: string;
  subtitulo: string | null;
  dataTexto: string;
  dataIso: string | null;
  url: string | null;
  imagemUrl: string | null;
  emoji: string;
  logoUrl?: string | null;
  /** Rótulo configurável da fonte; quando presente, substitui `tipo` na home. */
  rotulo?: string | null;
}

export interface EventoFonteLogoUploadResponse {
  url: string;
  compactado: boolean;
  largura: number | null;
  altura: number | null;
}

export interface EventosProximosResponse {
  eventos: Evento[];
  atualizadoEm: string;
  fontes: string[];
}

export type EventosAgendaResponse = EventosProximosResponse;

export interface EventoFonte {
  id: number;
  codigo: string;
  nome: string;
  url: string;
  parserTipo: string;
  ativo: boolean;
  ordem: number;
  limite: number | null;
  configJson: Record<string, unknown> | null;
  logoUrl: string | null;
  rotulo: string | null;
  criadoEm?: string;
  atualizadoEm?: string;
}

export interface EventoParserTipo {
  codigo: string;
  nome: string;
  descricao: string;
}

export interface EventoFontePayload {
  codigo?: string;
  nome: string;
  url: string;
  parserTipo: string;
  ativo: boolean;
  ordem: number;
  limite: number | null;
  logoUrl?: string | null;
  rotulo?: string | null;
}

export interface EventoFonteTesteResponse {
  fonte: Pick<EventoFonte, 'id' | 'codigo' | 'nome' | 'url' | 'parserTipo'>;
  total: number;
  eventos: Evento[];
  testadoEm: string;
}
