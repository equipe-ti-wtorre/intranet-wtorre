export interface TopbarLogo {
  id: string;
  nome: string;
  alt: string;
  imagem_url: string;
  link_url: string | null;
  nova_aba: boolean;
  ordem: number;
}

export interface TopbarConfig {
  suporte: { texto: string };
  logos: TopbarLogo[];
}

export interface TopbarLogoUploadResponse {
  imagem_url: string;
  compactado: boolean;
  largura: number | null;
  altura: number | null;
}

export const TOPBAR_DEFAULTS: TopbarConfig = {
  suporte: {
    texto: 'CCO: Ramal 6673 TEL.: (11) 4800 - 6673',
  },
  logos: [
    {
      id: 'wtorre',
      nome: 'WTorre',
      alt: 'WTorre',
      imagem_url: '/logos/wtorre.png',
      link_url: null,
      nova_aba: true,
      ordem: 0,
    },
    {
      id: 'nubank',
      nome: 'Nubank Parque',
      alt: 'Nubank Parque',
      imagem_url: '/logos/nubank-parque.png',
      link_url: null,
      nova_aba: true,
      ordem: 1,
    },
    {
      id: 'base',
      nome: 'Base Coworking',
      alt: 'Base Coworking',
      imagem_url: '/logos/base-coworking.png',
      link_url: null,
      nova_aba: true,
      ordem: 2,
    },
    {
      id: 'novo',
      nome: 'Novo Anhangabaú',
      alt: 'Novo Anhangabaú',
      imagem_url: '/logos/novo-anhangabau.png',
      link_url: null,
      nova_aba: true,
      ordem: 3,
    },
  ],
};
