export type TipoBloco = 'texto' | 'imagem' | 'carrossel' | 'botao';

export type StatusPagina = 'rascunho' | 'publicada';

export interface BlocoTextoConfig {
  titulo?: string;
  html: string;
}

export interface BlocoImagemConfig {
  url: string;
  alt?: string;
  legenda?: string;
  link?: string;
}

export interface CarrosselSlide {
  url: string;
  alt?: string;
  legenda?: string;
  link?: string;
}

export interface BlocoCarrosselConfig {
  slides: CarrosselSlide[];
  autoplay?: boolean;
  intervaloMs?: number;
}

export type EstiloBotao = 'primario' | 'secundario' | 'fantasma';
export type AlinhamentoBotao = 'left' | 'center' | 'right';

export interface BlocoBotaoConfig {
  label: string;
  url: string;
  estilo: EstiloBotao;
  alinhamento: AlinhamentoBotao;
  novaAba?: boolean;
}

export type BlocoConfig =
  | BlocoTextoConfig
  | BlocoImagemConfig
  | BlocoCarrosselConfig
  | BlocoBotaoConfig;

export interface PaginaBloco {
  id: string;
  tipo: TipoBloco;
  ordem: number;
  config: BlocoConfig;
}

export interface Pagina {
  id: number;
  slug: string;
  titulo: string;
  descricao: string | null;
  blocos: PaginaBloco[];
  status: StatusPagina;
  criado_por: number | null;
  criado_em: string;
  atualizado_em: string;
}

export interface PaginaPublicaResumo {
  id: number;
  slug: string;
  titulo: string;
}

export interface PaginaPayload {
  titulo: string;
  slug: string;
  descricao?: string | null;
  blocos: PaginaBloco[];
  status?: StatusPagina;
}

export interface UploadImagemResp {
  url: string;
}
