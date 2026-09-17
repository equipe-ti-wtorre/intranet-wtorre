import { UrlMatchResult, UrlSegment } from '@angular/router';

/** Mesmo padrão de `parseSlug` no backend (8–80 chars). */
export const PESQUISAS_TOKEN_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{7,79}$/;

export function pesquisasLinkPublico(token: string | null | undefined): string {
  if (!token || typeof window === 'undefined') return '';
  return `${window.location.origin}/${token}`;
}

export function pesquisasLinkFeedback(): string {
  if (typeof window === 'undefined') return '';
  return `${window.location.origin}/feedback`;
}

export function pesquisasResultadosPath(item: {
  slug?: string | null;
  id: number;
}): (string | number)[] {
  return ['/pesquisas/formulario', item.slug || item.id, 'resultados'];
}

/** `/feedback` (portal genérico) ou `/MNFGufAyFeZlRFz2OIvgqQ` (token do form). */
export function pesquisasPublicoTokenMatch(segments: UrlSegment[]): UrlMatchResult | null {
  if (segments.length !== 1) return null;
  const token = segments[0].path;
  if (token.toLowerCase() === 'feedback') {
    return { consumed: segments, posParams: { hub: segments[0] } };
  }
  if (!PESQUISAS_TOKEN_RE.test(token)) return null;
  return { consumed: segments, posParams: { token: segments[0] } };
}
