import {
  BrandIndexEntry,
  IconChip,
  ICONE_LEGADO_MAP,
  ICONE_PADRAO,
  ICONE_REGEX,
  IconeResolvido,
  IconeSegmento,
  LucideIndexEntry,
  MaterialIconStyle,
  MaterialIndexEntry,
} from '../../models/documento.model';

export const ICON_SEARCH_MAX = 300;
export const ICON_INITIAL_MAX = 60;
export const ICON_PAGE_SIZE = 60;

export interface IconSearchResult {
  namespaced: string;
  label: string;
  segmento: IconeSegmento;
}

export function deburr(text: string): string {
  return text.normalize('NFD').replace(/\u0300-\u036f/g, '');
}

function normalizeQuery(q: string): string {
  return deburr(q.trim().toLowerCase());
}

function expandSynonyms(query: string, synonyms: Record<string, string>): string[] {
  const q = normalizeQuery(query);
  const terms = new Set<string>([q]);
  for (const [pt, en] of Object.entries(synonyms)) {
    const ptNorm = normalizeQuery(pt);
    if (q.includes(ptNorm) || ptNorm.includes(q)) {
      terms.add(normalizeQuery(en));
      terms.add(ptNorm);
    }
  }
  return [...terms];
}

function buildSearchTerms(query: string, synonyms: Record<string, string>): string[] {
  const q = normalizeQuery(query);
  if (!q) return [];

  const words = q.split(/\s+/).filter(Boolean);
  const terms = new Set<string>();

  for (const word of words) {
    for (const t of expandSynonyms(word, synonyms)) {
      if (t) terms.add(t);
    }
  }

  if (words.length > 1) {
    for (const t of expandSynonyms(q, synonyms)) {
      if (t) terms.add(t);
    }
  }

  return [...terms];
}

function matchesTerms(haystack: string, terms: string[]): boolean {
  const hay = normalizeQuery(haystack);
  return terms.some((t) => t && hay.includes(t));
}

export function getInitialLucideIcons(
  entries: LucideIndexEntry[],
  limit = ICON_INITIAL_MAX
): IconSearchResult[] {
  return [...entries]
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, limit)
    .map((entry) => ({
      namespaced: `lucide:${entry.name}`,
      label: entry.name,
      segmento: 'lucide' as const,
    }));
}

export function getInitialBrandIcons(
  entries: BrandIndexEntry[],
  limit = ICON_INITIAL_MAX
): IconSearchResult[] {
  return [...entries]
    .sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'))
    .slice(0, limit)
    .map((entry) => ({
      namespaced: `brand:${entry.slug}`,
      label: entry.title,
      segmento: 'brand' as const,
    }));
}

export function searchLucideIcons(
  entries: LucideIndexEntry[],
  query: string,
  synonyms: Record<string, string>,
  limit = ICON_SEARCH_MAX
): IconSearchResult[] {
  const terms = buildSearchTerms(query, synonyms);
  if (!terms.length) return [];

  const results: IconSearchResult[] = [];

  for (const entry of entries) {
    const nameHay = entry.name;
    const tagHay = entry.tags.join(' ');
    if (matchesTerms(nameHay, terms) || matchesTerms(tagHay, terms)) {
      results.push({
        namespaced: `lucide:${entry.name}`,
        label: entry.name,
        segmento: 'lucide',
      });
      if (results.length >= limit) break;
    }
  }

  return results;
}

export function searchBrandIcons(
  entries: BrandIndexEntry[],
  query: string,
  limit = ICON_SEARCH_MAX
): IconSearchResult[] {
  const q = normalizeQuery(query);
  if (!q) return [];

  const words = q.split(/\s+/).filter(Boolean);
  const results: IconSearchResult[] = [];

  for (const entry of entries) {
    const aliasHay = [
      entry.title,
      entry.slug,
      ...(entry.aliases?.aka ?? []),
      ...(entry.aliases?.old ?? []),
      ...(entry.aliases?.dup?.map((d) => d.title) ?? []),
    ].join(' ');

    const matches =
      words.length > 0
        ? words.every(
            (word) =>
              normalizeQuery(entry.slug).includes(word) ||
              normalizeQuery(entry.title).includes(word) ||
              normalizeQuery(aliasHay).includes(word)
          )
        : normalizeQuery(entry.slug).includes(q) ||
          normalizeQuery(entry.title).includes(q) ||
          normalizeQuery(aliasHay).includes(q);

    if (matches) {
      results.push({
        namespaced: `brand:${entry.slug}`,
        label: entry.title,
        segmento: 'brand',
      });
      if (results.length >= limit) break;
    }
  }

  return results;
}

function materialNamespaced(style: MaterialIconStyle, name: string): string {
  return `material:${style}:${name}`;
}

function materialLabel(name: string, style: MaterialIconStyle): string {
  return `${name} (${style})`;
}

export function materialSymbolId(id: string): string {
  const [style, ...nameParts] = id.split(':');
  return `${style}_${nameParts.join('_')}`;
}

export function getInitialMaterialIcons(
  entries: MaterialIndexEntry[],
  limit = ICON_INITIAL_MAX
): IconSearchResult[] {
  return [...entries]
    .sort((a, b) => a.style.localeCompare(b.style) || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map((entry) => ({
      namespaced: materialNamespaced(entry.style, entry.name),
      label: materialLabel(entry.name, entry.style),
      segmento: 'material' as const,
    }));
}

export function searchMaterialIcons(
  entries: MaterialIndexEntry[],
  query: string,
  limit = ICON_SEARCH_MAX
): IconSearchResult[] {
  const q = normalizeQuery(query);
  if (!q) return [];

  const words = q.split(/\s+/).filter(Boolean);
  const results: IconSearchResult[] = [];

  for (const entry of entries) {
    const hay = `${entry.name} ${entry.style}`;
    const hayNorm = normalizeQuery(hay);

    const matches =
      words.length > 0
        ? words.every((word) => hayNorm.includes(word))
        : hayNorm.includes(q);

    if (matches) {
      results.push({
        namespaced: materialNamespaced(entry.style, entry.name),
        label: materialLabel(entry.name, entry.style),
        segmento: 'material',
      });
      if (results.length >= limit) break;
    }
  }

  return results;
}

export function searchAllIcons(
  lucideEntries: LucideIndexEntry[],
  brandEntries: BrandIndexEntry[],
  materialEntries: MaterialIndexEntry[],
  query: string,
  synonyms: Record<string, string>,
  limit = ICON_SEARCH_MAX
): IconSearchResult[] {
  const lucide = searchLucideIcons(lucideEntries, query, synonyms, limit)
    .sort((a, b) => a.label.localeCompare(b.label));
  const brand = searchBrandIcons(brandEntries, query, limit)
    .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  const material = searchMaterialIcons(materialEntries, query, limit)
    .sort((a, b) => a.label.localeCompare(b.label));

  return [...lucide, ...brand, ...material];
}

export function segmentoBadgeLabel(segmento: IconeSegmento): string {
  switch (segmento) {
    case 'brand':
      return 'Marca';
    case 'material':
      return 'Material';
    case 'custom':
      return 'Personalizado';
    default:
      return 'Ícone';
  }
}

export function resolveIconeRaw(icone: string | null | undefined): IconeResolvido {
  const val = icone?.trim().toLowerCase() || '';
  if (!val) {
    return parseNamespaced(ICONE_PADRAO);
  }

  if (!val.includes(':')) {
    const mapped = ICONE_LEGADO_MAP[val];
    if (mapped) return parseNamespaced(mapped);
    if (/^[a-z0-9-]+$/.test(val)) {
      return parseNamespaced(`lucide:${val}`);
    }
    return parseNamespaced(ICONE_PADRAO);
  }

  if (ICONE_REGEX.test(val)) {
    return parseNamespaced(val);
  }

  return parseNamespaced(ICONE_PADRAO);
}

export function parseNamespaced(namespaced: string): IconeResolvido {
  const [segmento, ...rest] = namespaced.split(':');
  const id = rest.join(':');
  return {
    segmento: segmento as IconeSegmento,
    id,
    namespaced: `${segmento}:${id}`,
  };
}

export function normalizarIconeParaLeitura(icone: string | null | undefined): string {
  return resolveIconeRaw(icone).namespaced;
}

export function normalizarIconeParaSalvar(icone: string | null | undefined): string | null {
  if (icone == null || icone.trim() === '') return null;
  return normalizarIconeParaLeitura(icone);
}

export function isChipForSegment(chip: IconChip, segment: IconeSegmento): boolean {
  return !chip.segment || chip.segment === segment;
}
