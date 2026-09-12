export type LoginEmpresaVariante = 'wt' | 'nb' | 'bs' | 'an';
export type LoginEmpresaEstilo = 'wlogo' | 'led';

export const LOGIN_VARIANTE_CORES: Record<LoginEmpresaVariante, string> = {
  wt: '#1d54e6',
  nb: '#8d0de3',
  bs: '#0d9488',
  an: '#c2410c',
};

export const LOGIN_VARIANTE_ESTILOS: Record<LoginEmpresaVariante, LoginEmpresaEstilo> = {
  wt: 'wlogo',
  nb: 'led',
  bs: 'led',
  an: 'led',
};

export interface LoginEmpresaChip {
  id: string;
  nome: string;
  variante: LoginEmpresaVariante;
  cor: string;
  estilo: LoginEmpresaEstilo;
  imagem_url: string | null;
  link_url: string | null;
  nova_aba: boolean;
  ordem: number;
}

export interface LoginConfig {
  favicon_url: string | null;
  marca_topo: { titulo: string; subtitulo: string; exibir: boolean };
  hero: {
    titulo_linha1: string;
    titulo_destaque: string;
    lead: string;
    exibir: boolean;
  };
  pill: { texto: string };
  auth: { titulo: string; subtitulo: string };
  aviso_seguranca: string;
  rodape: { copyright: string; contato: string };
  empresas_titulo: string;
  empresas: LoginEmpresaChip[];
}

export function corDeVariante(variante: LoginEmpresaVariante): string {
  return LOGIN_VARIANTE_CORES[variante];
}

export function estiloDeVariante(variante: LoginEmpresaVariante): LoginEmpresaEstilo {
  return LOGIN_VARIANTE_ESTILOS[variante];
}

export const LOGIN_DEFAULTS: LoginConfig = {
  favicon_url: null,
  marca_topo: {
    titulo: 'GRUPO WTORRE',
    subtitulo: 'INTRANET CORPORATIVA',
    exibir: true,
  },
  hero: {
    titulo_linha1: 'Um só grupo.',
    titulo_destaque: 'Quatro grandes destinos.',
    lead:
      'Acesse sistemas, documentos e serviços das empresas do grupo em uma única plataforma segura.',
    exibir: true,
  },
  pill: {
    texto: 'PÁGINA CORPORATIVA · ACESSO RESTRITO',
  },
  auth: {
    titulo: 'Entrar na intranet',
    subtitulo: 'Use sua conta corporativa Microsoft para continuar.',
  },
  aviso_seguranca:
    'Aviso de segurança. Este é um sistema de uso exclusivo do Grupo WTorre. O acesso é monitorado e registrado. O uso não autorizado é proibido e pode estar sujeito a medidas disciplinares e legais. Ao continuar, você concorda com a Política de Segurança da Informação.',
  rodape: {
    copyright: '© 2026 Grupo WTorre · Uso interno e confidencial',
    contato: 'CCO: Ramal 6673 · TEL.: (11) 4800-6673',
  },
  empresas_titulo: 'Empresas do grupo',
  empresas: [
    {
      id: 'wtorre',
      nome: 'WTORRE',
      variante: 'wt',
      cor: LOGIN_VARIANTE_CORES.wt,
      estilo: 'wlogo',
      imagem_url: null,
      link_url: null,
      nova_aba: true,
      ordem: 0,
    },
    {
      id: 'nubank',
      nome: 'Nubank Parque',
      variante: 'nb',
      cor: LOGIN_VARIANTE_CORES.nb,
      estilo: 'led',
      imagem_url: null,
      link_url: null,
      nova_aba: true,
      ordem: 1,
    },
    {
      id: 'base',
      nome: 'base',
      variante: 'bs',
      cor: LOGIN_VARIANTE_CORES.bs,
      estilo: 'led',
      imagem_url: null,
      link_url: null,
      nova_aba: true,
      ordem: 2,
    },
    {
      id: 'anhangabau',
      nome: 'Anhangabaú',
      variante: 'an',
      cor: LOGIN_VARIANTE_CORES.an,
      estilo: 'led',
      imagem_url: null,
      link_url: null,
      nova_aba: true,
      ordem: 3,
    },
  ],
};
