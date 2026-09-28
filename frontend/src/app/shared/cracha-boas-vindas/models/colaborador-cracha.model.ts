export interface FotoAjuste {
  dataUrl: string;
  naturalW: number;
  naturalH: number;
  zoom: number;
  panX: number;
  panY: number;
  rotation: number;
}

/** 'N' = neutro (sem flexao de genero) - usado quando a origem dos dados nao coleta genero, ex.: Solicitação de Colaborador. */
export type GeneroColaborador = 'M' | 'F' | 'N';

/** Dados minimos para gerar o cracha e o cartao de boas-vindas. */
export interface ColaboradorCracha {
  id: string;
  nomeCompleto: string;
  nomeCurto: string;
  genero: GeneroColaborador;
  empresaId: string;
  area: string;
  cargo: string;
  email: string;
  bio: string;
  foto: FotoAjuste | null;
}

export function novoColaboradorCracha(empresaId = 'real-arenas'): ColaboradorCracha {
  return {
    id: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    nomeCompleto: '',
    nomeCurto: '',
    genero: 'M',
    empresaId,
    area: '',
    cargo: '',
    email: '',
    bio: '',
    foto: null,
  };
}
