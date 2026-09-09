import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { RamalAuthService } from '../services/ramal-auth.service';

export const ramalAuthGuard: CanActivateFn = () => {
  const auth = inject(RamalAuthService);
  const router = inject(Router);

  if (auth.temAccessValido()) {
    return true;
  }

  return auth.ensureSession().pipe(
    map((ok) =>
      ok || auth.temAccessValido() ? true : router.createUrlTree(['/ramal/login'])
    )
  );
};

export const ramalGuestGuard: CanActivateFn = () => {
  const auth = inject(RamalAuthService);
  const router = inject(Router);

  if (!auth.temSessao()) {
    return true;
  }

  return auth.ensureSession().pipe(
    map((ok) => {
      if (ok && auth.temAccessValido()) {
        return router.createUrlTree(['/ramal']);
      }
      if (!ok) {
        auth.limparSessao();
      }
      return true;
    })
  );
};

export const ramalAdminGuard: CanActivateFn = () => {
  const auth = inject(RamalAuthService);
  const router = inject(Router);

  if (auth.temAccessValido() && auth.isAdmin()) {
    return true;
  }

  return auth.ensureSession().pipe(
    map((ok) => {
      if (ok && auth.temAccessValido() && auth.isAdmin()) {
        return true;
      }
      if (ok && auth.temAccessValido()) {
        return router.createUrlTree(['/ramal']);
      }
      return router.createUrlTree(['/ramal/login']);
    })
  );
};
