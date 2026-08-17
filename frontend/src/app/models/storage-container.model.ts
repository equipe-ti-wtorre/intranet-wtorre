export interface StorageContainer {
  id: number | null;
  nome: string;
  rotulo: string;
  descricao?: string | null;
  padrao: boolean;
  ativo: boolean;
  qtdVideos?: number;
  qtd_videos?: number;
  importado?: boolean;
}

export interface StorageContainerPayload {
  nome: string;
  rotulo: string;
  descricao?: string;
  padrao?: boolean;
  criarNoAzure?: boolean;
  ativo?: boolean;
}
