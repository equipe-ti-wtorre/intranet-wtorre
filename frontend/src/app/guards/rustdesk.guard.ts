import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlMatchResult, UrlSegment } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from '../services/auth.service';

/** Aceita /ti/rustdesk, /ti/RustDesk, /TI/RUSTDESK, etc. */
export function rustdeskRouteMatch(segments: UrlSegment[]): UrlMatchResult | null {
  if (
    segments.length >= 2 &&
    segments[0].path.toLowerCase() === 'ti' &&
    segments[1].path.toLowerCase() === 'rustdesk'
  ) {
    return { consumed: segments.slice(0, 2) };
  }
  return null;
}

/** Página TI / Rust Desk: Super Admin ou módulo `rustdesk`. */
export const rustdeskGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return auth.ensureSession().pipe(
    map((ok) => {
      if (!ok) {
        return router.createUrlTree(['/login']);
      }
      if (auth.hasModulo('rustdesk')) {
        return true;
      }
      return router.createUrlTree(['/inicio']);
    })
  );
};
