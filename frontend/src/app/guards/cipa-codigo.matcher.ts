import { UrlMatchResult, UrlSegment } from '@angular/router';

export const CIPA_CODIGO_RE = /^[a-f0-9]{24}$/i;

export function cipaCodigoRouteMatch(segments: UrlSegment[]): UrlMatchResult | null {
  if (segments.length === 1 && CIPA_CODIGO_RE.test(segments[0].path)) {
    return {
      consumed: segments,
      posParams: { codigo: segments[0] },
    };
  }
  return null;
}
