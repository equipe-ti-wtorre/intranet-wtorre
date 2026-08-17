export type IconeSegmento = 'lucide' | 'brand' | 'material' | 'custom';

export interface IconeResolvido {
  segmento: IconeSegmento;
  id: string;
  namespaced: string;
}

export const ICONE_PADRAO = 'lucide:folder';

export const ICONE_REGEX =
  /^(?:(?:lucide|brand):[a-z0-9-]+|material:(?:outlined|rounded|sharp):[a-z0-9_]+|custom:[a-f0-9-]{36})$/;

export const ICONE_LEGADO_MAP: Record<string, string> = {
  folder: 'lucide:folder',
  shield: 'lucide:shield',
  brand: 'lucide:badge',
  cap: 'lucide:graduation-cap',
  file: 'lucide:file-text',
};

export const ICONE_LEGADO_VALUES = new Set(Object.keys(ICONE_LEGADO_MAP));

export interface LucideIndexEntry {
  name: string;
  tags: string[];
}

export interface BrandIndexEntry {
  slug: string;
  title: string;
  hex: string;
  aliases?: {
    aka?: string[];
    dup?: { title: string }[];
    old?: string[];
  };
}

export type MaterialIconStyle = 'outlined' | 'rounded' | 'sharp';

export interface MaterialIndexEntry {
  name: string;
  style: MaterialIconStyle;
}

export interface IconChip {
  label: string;
  query: string;
  segment?: IconeSegmento;
}

export interface DocumentoPagina {
  id: number;
  nome: string;
  slug: string;
  descricao?: string | null;
  logo_url?: string | null;
  ordem?: number;
  ativo?: boolean;
  exibir_menu_treinamento?: boolean;
}

export interface DocumentoSetor {
  id: number;
  nome: string;
  slug: string;
  cor?: string | null;
  ordem?: number;
  ativo?: boolean;
}

export interface CategoriaDocumento {
  id: number;
  nome: string;
  slug: string;
  descricao?: string | null;
  icone?: string | null;
  parent_id?: number | null;
  pagina_id?: number | null;
  ordem?: number;
  ativo?: boolean;
  documentos_count?: number;
  children: CategoriaDocumento[];
}

export interface DocumentoSetorRef {
  id: number;
  nome: string;
  slug: string;
  cor?: string | null;
}

export interface VisibilidadeEntidade {
  pagina_id: number;
  pagina_nome?: string | null;
  pagina_slug?: string | null;
  categoria_id: number | null;
  categoria_nome?: string | null;
  categoria_slug?: string | null;
}

export interface VisibilidadeEntidadeInput {
  pagina_id: number;
  categoria_id: number;
}

export interface Documento {
  id: number;
  categoria_id: number;
  titulo: string;
  descricao?: string | null;
  thumbnail_url?: string | null;
  tem_thumb?: boolean;
  nome_original: string;
  mime: string;
  extensao: string;
  tamanho_bytes: number;
  setor_id?: number | null;
  setor?: DocumentoSetorRef | null;
  destaque?: boolean;
  destaque_ordem?: number;
  criado_em: string;
  atualizado_em?: string;
  visibilidades?: VisibilidadeEntidade[];
}

export interface CategoriaLegacyResolve {
  pagina_slug: string;
  categoria_slug: string;
  sub_slug?: string | null;
  categoria_id: number;
}

export interface CategoriaDocumentoPayload {
  nome: string;
  descricao?: string | null;
  icone?: string | null;
  parent_id?: number | null;
  pagina_id?: number;
  ordem?: number;
  ativo?: boolean;
}

export interface DocumentoPaginaPayload {
  nome: string;
  slug?: string;
  descricao?: string | null;
  logo_url?: string | null;
  ordem?: number;
  ativo?: boolean;
  exibir_menu_treinamento?: boolean;
}

export interface DocumentoPaginaLogoUploadResponse {
  url: string;
  compactado?: boolean;
  largura?: number | null;
  altura?: number | null;
}

export interface DocumentoSetorPayload {
  nome: string;
  slug?: string;
  cor?: string | null;
  ordem?: number;
  ativo?: boolean;
}

export interface DocumentoUpdatePayload {
  titulo?: string;
  descricao?: string | null;
  categoria_id?: number;
  setor_id?: number;
  destaque?: boolean;
  visibilidades?: VisibilidadeEntidadeInput[];
}

export interface CategoriaReorderItem {
  id: number;
  parent_id: number | null;
  ordem: number;
}

export const ALLOWED_EXTENSIONS = ['pdf', 'docx', 'xlsx', 'pptx', 'png', 'jpg', 'jpeg', 'zip'];
export const MAX_UPLOAD_MB = 50;
export const PREVIEWABLE_EXTENSIONS = ['pdf', 'png', 'jpg', 'jpeg'];
