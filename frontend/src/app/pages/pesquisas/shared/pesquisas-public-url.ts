import { UrlMatchResult, UrlSegment } from '@angular/router';

/** Mesmo padrão de `parseSlug` no backend (8–80 chars). */
export const PESQUISAS_TOKEN_RE = /^[A-Za-z0-9_-]{8,80}$/;

export function pesquisasLinkPublico(token: string | null | undefined): string {
  if (!token || typeof window === 'undefined') return '';
  return `${window.location.origin}/${token}`;
}

/** Mesmo destino do card no mural: `/pesquisas/formulario/{token}/responder`. */
export function pesquisasLinkInterno(token: string | null | undefined): string {
  if (!token || typeof window === 'undefined') return '';
  return `${window.location.origin}/pesquisas/formulario/${token}/responder`;
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

const VOLTAR_PADRAO = '/inicio';
const RESPONDER_PATH_RE = /\/pesquisas\/formulario\/[^/]+\/responder\/?$/i;

/** Path interno relativo; rejeita open-redirect, o hub de Formulários e a tela de responder. */
export function voltarPathSeguro(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s.startsWith('/') || s.startsWith('//') || s.includes('://')) return null;
  if (s.length > 500 || /[\n\r\\]/.test(s)) return null;
  const pathOnly = (s.split('?')[0].split('#')[0].replace(/\/+$/, '') || '/');
  if (RESPONDER_PATH_RE.test(pathOnly)) return null;
  if (pathOnly === '/pesquisas') return null;
  return s;
}

export function destinoAposResponder(opts: {
  queryVoltar?: string | null;
  lastUrl?: string | null;
  previousUrl?: string | null;
}): string {
  return (
    voltarPathSeguro(opts.queryVoltar) ||
    voltarPathSeguro(opts.lastUrl) ||
    voltarPathSeguro(opts.previousUrl) ||
    VOLTAR_PADRAO
  );
}

/** Card do mural: volta ao início da intranet depois de enviar. */
export function pesquisasLinkResponderComVoltar(link: string): string {
  const path = link.split('?')[0].split('#')[0];
  if (!RESPONDER_PATH_RE.test(path)) return link;
  if (/[?&]voltar=/.test(link)) return link;
  return link.includes('?') ? `${link}&voltar=/inicio` : `${link}?voltar=/inicio`;
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
