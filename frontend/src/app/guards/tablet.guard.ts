import { inject } from '@angular/core';
import { CanActivateFn, CanMatchFn, Router } from '@angular/router';
import { Observable, map, of } from 'rxjs';
import { TabletAuthService } from '../services/tablet-auth.service';

function sessaoPronta(auth: TabletAuthService): Observable<boolean> {
  if (auth.temAccessValido()) return of(true);
  return auth.ensureSession();
}

export const tabletAuthGuard: CanActivateFn = () => {
  const auth = inject(TabletAuthService);
  const router = inject(Router);

  if (auth.temAccessValido()) {
    return true;
  }

  return auth.ensureSession().pipe(
    map((ok) =>
      ok || auth.temAccessValido() ? true : router.createUrlTree(['/tablet/login'])
    )
  );
};

export const tabletGuestGuard: CanActivateFn = () => {
  const auth = inject(TabletAuthService);
  const router = inject(Router);

  if (!auth.temSessao()) {
    return true;
  }

  return auth.ensureSession().pipe(
    map((ok) => {
      if (ok && auth.temAccessValido()) {
        return router.createUrlTree(['/tablet']);
      }
      if (!ok) {
        auth.limparSessao();
      }
      return true;
    })
  );
};

export const tabletAdminCanMatch: CanMatchFn = () => {
  const auth = inject(TabletAuthService);
  return sessaoPronta(auth).pipe(map((ok) => !!(ok && auth.isAdmin())));
};

export const tabletUserCanMatch: CanMatchFn = () => {
  const auth = inject(TabletAuthService);
  return sessaoPronta(auth).pipe(map((ok) => !!(ok && !auth.isAdmin())));
};
