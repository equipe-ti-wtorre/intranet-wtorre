export interface Empresa {
  id: string;
  classe: 'wtorre' | 'nubank' | 'base' | 'novo';
  badge: string;
  logo: string;
  logoHtml?: boolean;
  role: string;
  desc: string;
}

export const EMPRESAS: Empresa[] = [
  {
    id: 'wtorre',
    classe: 'wtorre',
    badge: 'Holding',
    logo: 'WTORRE',
    role: 'Construção & Empreendimentos',
    desc: 'Engenharia, projetos e gestão de grandes empreendimentos.',
  },
  {
    id: 'nubank',
    classe: 'nubank',
    badge: 'Arena',
    logo: 'Nubank Parque',
    role: 'Arena · Shows & Jogos',
    desc: 'Operação de eventos, jogos e experiências do estádio.',
  },
  {
    id: 'base',
    classe: 'base',
    badge: 'Workspace',
    logo: 'base',
    role: 'Coworking & Escritórios',
    desc: 'Espaços compartilhados, reservas de salas e comunidade.',
  },
  {
    id: 'novo',
    classe: 'novo',
    badge: 'Urbano',
    logo: 'NOVO ANHANGABAÚ',
    logoHtml: true,
    role: 'Espaço Urbano & Cultura',
    desc: 'Gestão do complexo, eventos públicos e parcerias.',
  },
];
