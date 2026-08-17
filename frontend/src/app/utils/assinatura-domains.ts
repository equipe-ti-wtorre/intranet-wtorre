import { DominioConfig } from '../models/assinatura.model';

export const BLOB_BASE = 'https://nubankparqueassets.blob.core.windows.net/email-assets';

export const FONTE_NUSANS_MEDIUM = '/api/v1/assinaturas/fonts/NuSansDisplay-Medium.otf';
export const FONTE_NUSANS_REGULAR = '/api/v1/assinaturas/fonts/NuSansDisplay-Regular.otf';

/** Domínios que não devem gerar assinatura (ex.: alias padrão do tenant M365). */
export const DOMINIOS_EXCLUIDOS = new Set(['wtorre.onmicrosoft.com']);

const DOMINIOS: Record<string, Omit<DominioConfig, 'dominio'>> = {
  'nubankparque.com': {
    cor: '#8D0DE3',
    entidade: 'Nubank Parque',
    banner: `${BLOB_BASE}/banner_nubank_parque.gif`,
    font: "'NuSansDisplay',Helvetica,Arial,sans-serif",
    wNome: '500',
    wResto: '400',
    fontFace: true,
  },
  'allianzparque.com.br': {
    cor: '#005399',
    entidade: 'Real Arenas',
    banner: `${BLOB_BASE}/banner_allianz_parque.gif`,
    font: 'Helvetica,Arial,sans-serif',
    wNome: 'bold',
    wResto: 'normal',
    fontFace: false,
  },
  'basecoworking.space': {
    cor: '#005399',
    entidade: 'Base Coworking',
    banner: `${BLOB_BASE}/banner_base_coworking.gif`,
    font: 'Helvetica,Arial,sans-serif',
    wNome: 'bold',
    wResto: 'normal',
    fontFace: false,
  },
  'novoanhangabau.com.br': {
    cor: '#000000',
    entidade: 'Novo Anhangabaú',
    banner: `${BLOB_BASE}/banner_novoanhangabau.gif`,
    font: 'Arial,sans-serif',
    wNome: 'bold',
    wResto: 'normal',
    fontFace: false,
  },
  'wtentretenimento.com.br': {
    cor: '#005399',
    entidade: 'Real Arenas',
    banner: `${BLOB_BASE}/banner_allianz_parque.gif`,
    font: 'Helvetica,Arial,sans-serif',
    wNome: 'bold',
    wResto: 'normal',
    fontFace: false,
  },
  'wtorre.com.br': {
    cor: '#005399',
    entidade: 'WTorre',
    banner: `${BLOB_BASE}/banner_wtorre.gif`,
    font: 'Helvetica,Arial,sans-serif',
    wNome: 'bold',
    wResto: 'normal',
    fontFace: false,
  },
};

/** Legado: alguns aliases ainda usam o sufixo .com.br. */
const DOMINIO_ALIASES: Record<string, string> = {
  'nubankparque.com.br': 'nubankparque.com',
};

export function extrairDominio(email: string): string | null {
  const idx = email.lastIndexOf('@');
  if (idx < 0) return null;
  return email.slice(idx + 1).toLowerCase();
}

export function normalizarDominio(dominio: string): string {
  return DOMINIO_ALIASES[dominio] ?? dominio;
}

export function resolverDominio(email: string): DominioConfig | null {
  const bruto = extrairDominio(email);
  if (!bruto) return null;
  const dominio = normalizarDominio(bruto);
  if (!DOMINIOS[dominio]) return null;
  return { dominio, ...DOMINIOS[dominio] };
}

export function isDominioMapeado(email: string): boolean {
  const bruto = extrairDominio(email);
  if (!bruto) return false;
  return normalizarDominio(bruto) in DOMINIOS;
}

export function isDominioExcluido(email: string): boolean {
  const dominio = extrairDominio(email);
  if (!dominio) return false;
  if (DOMINIOS_EXCLUIDOS.has(dominio)) return true;
  return dominio.endsWith('.onmicrosoft.com');
}

export function isEmailPermitido(email: string): boolean {
  return !isDominioExcluido(email);
}

export function listarDominios(): string[] {
  return Object.keys(DOMINIOS);
}

export function resolverDominioPorChave(dominio: string): DominioConfig | null {
  const key = normalizarDominio(dominio.toLowerCase());
  if (!DOMINIOS[key]) return null;
  return { dominio: key, ...DOMINIOS[key] };
}

export function dominioEstiloPadrao(email: string): string | null {
  const bruto = extrairDominio(email);
  if (!bruto) return null;
  const key = normalizarDominio(bruto);
  return key in DOMINIOS ? key : null;
}

export interface OpcaoBanner {
  dominio: string;
  entidade: string;
  cor: string;
}

export function listarOpcoesBanner(): OpcaoBanner[] {
  return Object.entries(DOMINIOS).map(([dominio, cfg]) => ({
    dominio,
    entidade: cfg.entidade,
    cor: cfg.cor,
  }));
}
