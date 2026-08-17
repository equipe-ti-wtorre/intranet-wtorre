import { GRUPO_LOGOS } from '../data/grupo-logos.data';
import { EmpresaClasse } from '../models/colaborador.model';

const MARCA_HEX: Record<EmpresaClasse, string> = {
  wtorre: '#1d54e6',
  nubank: '#8a05be',
  base: '#0e8da0',
  novo: '#1a1a1a',
  neutro: '#8a93a8',
};

/** Nomes canônicos vindos de empresa_dominios (backend). */
const CANONICAL: Record<string, EmpresaClasse> = {
  WTorre: 'wtorre',
  'Nubank Parque': 'nubank',
  'Base Coworking': 'base',
  'Novo Anhangabaú': 'novo',
};

export function empresaParaClasse(empresa: string | null | undefined): EmpresaClasse {
  if (!empresa) return 'neutro';
  if (CANONICAL[empresa]) return CANONICAL[empresa];
  return 'neutro';
}

/** Empresas distintas para chips de filtro (sem nulos). */
export function empresasDistintas(colaboradores: { empresa: string | null }[]): string[] {
  const set = new Set<string>();
  for (const c of colaboradores) {
    if (c.empresa) set.add(c.empresa);
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

export function labelEmpresa(empresa: string | null | undefined): string {
  return empresa || 'Outros';
}

export function buildLogoMapPorNome(
  logos: { nome: string; imagem_url: string }[]
): Record<string, string> {
  return Object.fromEntries(
    logos.filter((l) => l.imagem_url).map((l) => [l.nome, l.imagem_url])
  );
}

export function fallbackLogoMapPorNome(): Record<string, string> {
  return Object.fromEntries(GRUPO_LOGOS.map((l) => [l.nome, l.logoSrc]));
}

export function logoUrlEmpresa(
  empresa: string | null | undefined,
  map: Record<string, string>
): string | null {
  if (!empresa) return null;
  return map[empresa] ?? null;
}

export function corMarcaEmpresa(empresa: string | null | undefined): string {
  return MARCA_HEX[empresaParaClasse(empresa)];
}
