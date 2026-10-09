import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { rotaParaModulo } from '../data/admin-modulos';

function redirectSemModulo(auth: AuthService, router: Router): ReturnType<Router['createUrlTree']> {
  const fallback = auth.primeiraRotaAdmin();
  if (fallback) {
    return router.createUrlTree(['/admin', fallback]);
  }
  return router.createUrlTree(['/inicio']);
}

export const moduloGuard = (codigo: string): CanActivateFn => () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return auth.ensureSession().pipe(
    map((ok) => {
      if (ok && auth.hasModulo(codigo)) return true;
      return redirectSemModulo(auth, router);
    })
  );
};

/** Página da intranet (não admin): sem o módulo volta para /inicio. */
export const moduloPaginaGuard = (codigo: string): CanActivateFn => () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return auth.ensureSession().pipe(
    map((ok) => {
      if (!ok) return router.createUrlTree(['/login']);
      if (auth.hasModulo(codigo)) return true;
      return router.createUrlTree(['/inicio']);
    })
  );
};

export const moduloGuardFromRoute: CanActivateFn = (route) => {
  const path = route.routeConfig?.path;
  const codigo = path ? rotaParaModulo(path) : null;
  if (!codigo) return true;

  const auth = inject(AuthService);
  const router = inject(Router);

  return auth.ensureSession().pipe(
    map((ok) => {
      if (ok && auth.hasModulo(codigo)) return true;
      return redirectSemModulo(auth, router);
    })
  );
};
