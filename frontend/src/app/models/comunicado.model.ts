export interface ComunicadoCategoriaRecord {
  id: number;
  nome: string;
  slug: string;
  cor: string;
  ordem: number;
  ativo: boolean;
  criado_em?: string;
  atualizado_em?: string;
}

export interface Comunicado {
  id: number;
  titulo: string;
  categoriaId: number;
  categoriaLabel: string;
  catClasse: string;
  categoriaCor: string;
  dia: string;
  mes: string;
  dataPublicacao: string;
}

export interface ComunicadoAdmin extends Comunicado {
  ordem: number | null;
  ativo: boolean;
  criado_por: number | null;
  criado_em: string;
  atualizado_em: string;
}

export interface ComunicadoPayload {
  titulo: string;
  categoriaId: number;
  dataPublicacao: string;
  ordem?: number | null;
  ativo?: boolean;
}

export interface ComunicadoCategoriaPayload {
  nome: string;
  cor: string;
  ordem?: number;
  ativo?: boolean;
}
