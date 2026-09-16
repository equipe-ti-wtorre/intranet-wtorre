import { GRUPO_LOGOS, GRUPO_LOGOS_LOGIN } from '../../../data/grupo-logos.data';
import { PesquisasTemplateVisual } from '../../../models/pesquisas.model';
import { TopbarLogo } from '../../../models/topbar.model';

export const PESQUISAS_MARCAS = ['wtorre', 'nubank'] as const;
const MARCAS = new Set<string>(PESQUISAS_MARCAS);

export interface PesquisasMarcaLogo {
  id: string;
  nome: string;
  alt: string;
  src: string;
}

export const PESQUISAS_TPL_WTORRE: PesquisasTemplateVisual = {
  codigo: 'wtorre',
  nome: 'WTorre',
  wordmark: 'WTORRE',
  corPrimaria: '#1d54e6',
  corPrimariaEscura: '#0b2a6b',
  raioPx: 10,
};

export interface PesquisasMarcaCores {
  primaria: string;
  primariaEscura: string;
  header: string;
  headerEscura: string;
  headerDegrade: boolean;
  corpo: string;
  texto: string;
  muted: string;
}

const MARCA_CORES: Record<string, PesquisasMarcaCores> = {
  wtorre: {
    primaria: '#0071CE',
    primariaEscura: '#022B4C',
    header: '#022B4C',
    headerEscura: '#022B4C',
    headerDegrade: false,
    corpo: '#F2F2F2',
    texto: '#022B4C',
    muted: '#1F597C',
  },
  nubank: {
    primaria: '#8D0DE3',
    primariaEscura: '#420465',
    header: '#8D0DE3',
    headerEscura: '#420465',
    headerDegrade: true,
    corpo: '#C9E2BF',
    texto: '#233240',
    muted: '#5a6a58',
  },
};

export function pesquisasMarcaCores(codigo?: string | null): PesquisasMarcaCores {
  return MARCA_CORES[marcaId(codigo)] || MARCA_CORES['wtorre'];
}

function marcaId(codigo?: string | null): string {
  return String(codigo || '').trim().toLowerCase();
}

export function pesquisasMarcasFallback(): PesquisasMarcaLogo[] {
  return PESQUISAS_MARCAS.map((id) => {
    const logo = GRUPO_LOGOS.find((l) => l.id === id);
    return {
      id,
      nome: logo?.nome || id,
      alt: logo?.alt || id,
      src: logo?.logoSrc || '',
    };
  }).filter((l) => l.src);
}

export function pesquisasMarcasOficiais(logos?: TopbarLogo[] | null): PesquisasMarcaLogo[] {
  const fallback = pesquisasMarcasFallback();
  if (!logos?.length) return fallback;
  const byId = new Map(logos.map((l) => [String(l.id || '').trim().toLowerCase(), l]));
  return fallback.map((fb) => {
    const fromTopbar = byId.get(fb.id);
    if (!fromTopbar?.imagem_url?.trim()) return fb;
    return {
      id: fb.id,
      nome: fromTopbar.nome || fb.nome,
      alt: fromTopbar.alt || fb.alt,
      src: fromTopbar.imagem_url,
    };
  });
}

export function pesquisasLogoSrc(
  codigo?: string | null,
  marcas?: PesquisasMarcaLogo[] | null
): string | undefined {
  const id = marcaId(codigo);
  if (!MARCAS.has(id)) return undefined;
  const fromMarcas = marcas?.find((m) => m.id === id)?.src;
  if (fromMarcas) return fromMarcas;
  return GRUPO_LOGOS.find((l) => l.id === id)?.logoSrc;
}

export function pesquisasLogoSrcDark(codigo?: string | null): string | undefined {
  const id = marcaId(codigo);
  if (!MARCAS.has(id)) return undefined;
  return GRUPO_LOGOS_LOGIN.find((l) => l.id === id)?.logoSrc;
}
