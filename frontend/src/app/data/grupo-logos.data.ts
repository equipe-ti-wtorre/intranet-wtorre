export interface GrupoLogo {
  id: string;
  nome: string;
  logoSrc: string;
  alt: string;
}

export const GRUPO_LOGOS: GrupoLogo[] = [
  { id: 'wtorre', nome: 'WTorre', logoSrc: '/logos/wtorre.png', alt: 'WTorre' },
  {
    id: 'nubank',
    nome: 'Nubank Parque',
    logoSrc: '/logos/nubank-parque.png',
    alt: 'Nubank Parque',
  },
  {
    id: 'base',
    nome: 'Base Coworking',
    logoSrc: '/logos/base-coworking.png',
    alt: 'Base Coworking',
  },
  {
    id: 'novo',
    nome: 'Novo Anhangabaú',
    logoSrc: '/logos/novo-anhangabau.png',
    alt: 'Novo Anhangabaú',
  },
];

/** Versões para fundo escuro (tela de login) */
export const GRUPO_LOGOS_LOGIN: GrupoLogo[] = [
  { id: 'wtorre', nome: 'WTorre', logoSrc: '/logos/login/wtorre.png', alt: 'WTorre' },
  {
    id: 'nubank',
    nome: 'Nubank Parque',
    logoSrc: '/logos/nubank-parque.png',
    alt: 'Nubank Parque',
  },
  {
    id: 'base',
    nome: 'Base Coworking',
    logoSrc: '/logos/login/base-coworking.png',
    alt: 'Base Coworking',
  },
  {
    id: 'novo',
    nome: 'Novo Anhangabaú',
    logoSrc: '/logos/login/novo-anhangabau.png',
    alt: 'Novo Anhangabaú',
  },
];
