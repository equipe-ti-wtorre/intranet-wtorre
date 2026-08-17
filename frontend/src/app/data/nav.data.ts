import { MenuItem } from '../models/menu.model';

export interface NavItem {
  label: string;
  href?: string;
}

export interface NavDropdown {
  label: string;
  head: string;
  href?: string;
  items: NavItem[];
}

export const NAV_LINKS: NavItem[] = [
  { label: 'Início', href: '/inicio' },
  { label: 'Agendas' },
  { label: 'Ramais', href: '/ramais' },
  { label: 'Aniversariantes', href: '/aniversariantes' },
  { label: 'Treinamentos', href: '/documentos/wtorre?cat=treinamentos' },
  { label: 'Assinaturas de E-mail', href: '/assinaturas' },
  { label: 'Plaquinhas Camarote', href: '/plaquinhas-camarote' },
  { label: 'Ferramentas de PDF', href: '/ferramentas/pdf' },
  { label: 'TI' },
  { label: 'BI' },
  { label: 'Oportunidades' },
  { label: 'Shows | Jogos' },
];

export const NAV_DROPDOWNS: NavDropdown[] = [
  {
    label: 'Sistemas Corporativos',
    head: 'Plataformas',
    items: [
      { label: 'Portal RH – Metadados' },
      { label: 'Portal de Reembolsos MEGA' },
      { label: 'Credenciamento' },
      { label: 'Oracle EBS' },
      { label: 'Mega Cloud' },
      { label: 'Portal de Aprovações' },
      { label: 'Mega – Task Center' },
      { label: 'Gestão de Ativos' },
      { label: 'Controle Telefonia' },
    ],
  },
  {
    label: 'Documentos',
    head: 'Repositórios',
    href: '/documentos',
    items: [],
  },
];

let fallbackId = 1;

function nextId(): number {
  return fallbackId++;
}

export function navDataToMenuTree(): MenuItem[] {
  fallbackId = 1;
  const items: MenuItem[] = [];

  const inicio = NAV_LINKS[0];
  items.push({
    id: nextId(),
    label: inicio.label,
    url: inicio.href ?? null,
    abrir_nova_aba: false,
    icone: null,
    cabecalho: null,
    children: [],
  });

  for (const dd of NAV_DROPDOWNS) {
    items.push({
      id: nextId(),
      label: dd.label,
      url: dd.href ?? null,
      abrir_nova_aba: false,
      icone: null,
      cabecalho: dd.head,
      children: dd.items.map((sub) => ({
        id: nextId(),
        label: sub.label,
        url: sub.href ?? '#',
        abrir_nova_aba: false,
        icone: null,
        cabecalho: null,
        children: [],
      })),
    });
  }

  for (const link of NAV_LINKS.slice(1)) {
    items.push({
      id: nextId(),
      label: link.label,
      url: link.href ?? null,
      abrir_nova_aba: false,
      icone: null,
      cabecalho: null,
      children: [],
    });
  }

  return items;
}
