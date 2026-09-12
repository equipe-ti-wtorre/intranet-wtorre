export type FooterColunaId = 'empresas' | 'atalhos' | 'suporte';

export interface FooterLink {
  label: string;
  url: string | null;
  tipo_destino: 'interna' | 'externa';
  nova_aba: boolean;
}

export interface FooterColuna {
  id: FooterColunaId;
  titulo: string;
  links: FooterLink[];
}

export interface FooterSponsor {
  label: string;
  url: string | null;
  nova_aba: boolean;
}

export interface FooterConfig {
  marca: { titulo: string; descricao: string };
  colunas: FooterColuna[];
  sponsors: FooterSponsor[];
  legal: { copyright: string; links_texto: string };
}

export const FOOTER_DEFAULTS: FooterConfig = {
  marca: {
    titulo: 'GRUPO WTORRE',
    descricao:
      'Intranet corporativa unificada. Conectando pessoas, sistemas e os destinos do grupo em uma única plataforma.',
  },
  colunas: [
    {
      id: 'empresas',
      titulo: 'Empresas',
      links: [
        { label: 'WTorre', url: null, tipo_destino: 'interna', nova_aba: false },
        { label: 'Nubank Parque', url: null, tipo_destino: 'interna', nova_aba: false },
        { label: 'Base Coworking', url: null, tipo_destino: 'interna', nova_aba: false },
        { label: 'Novo Anhangabaú', url: null, tipo_destino: 'interna', nova_aba: false },
      ],
    },
    {
      id: 'atalhos',
      titulo: 'Atalhos',
      links: [
        { label: 'Abertura de Chamados', url: null, tipo_destino: 'interna', nova_aba: false },
        { label: 'Sistemas Corporativos', url: null, tipo_destino: 'interna', nova_aba: false },
        { label: 'Documentos', url: '/documentos', tipo_destino: 'interna', nova_aba: false },
        { label: 'Oportunidades', url: null, tipo_destino: 'interna', nova_aba: false },
      ],
    },
    {
      id: 'suporte',
      titulo: 'Suporte',
      links: [
        { label: 'Service Desk · 4040', url: null, tipo_destino: 'interna', nova_aba: false },
        { label: 'Segurança da Informação', url: null, tipo_destino: 'interna', nova_aba: false },
        { label: 'Compliance', url: null, tipo_destino: 'interna', nova_aba: false },
        { label: 'Fale com o RH', url: null, tipo_destino: 'interna', nova_aba: false },
      ],
    },
  ],
  sponsors: [
    { label: 'WTORRE', url: null, nova_aba: true },
    { label: 'NUBANK PARQUE', url: null, nova_aba: true },
    { label: 'BASE COWORKING', url: null, nova_aba: true },
    { label: 'NOVO ANHANGABAÚ', url: null, nova_aba: true },
  ],
  legal: {
    copyright: '© 2026 Grupo WTorre · Uso interno e confidencial',
    links_texto: 'Política de Privacidade · Termos de Uso · v2.4',
  },
};
