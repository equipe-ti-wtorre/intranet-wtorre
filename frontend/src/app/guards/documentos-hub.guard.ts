import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from '../services/auth.service';

function redirectSemAcesso(auth: AuthService, router: Router): ReturnType<Router['createUrlTree']> {
  const fallback = auth.primeiraRotaAdmin();
  if (fallback) {
    return router.createUrlTree(['/admin', fallback]);
  }
  return router.createUrlTree(['/inicio']);
}

export const documentosHubGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return auth.ensureSession().pipe(
    map((ok) => {
      if (!ok) return redirectSemAcesso(auth, router);
      if (auth.hasModulo('documentos') || auth.hasModulo('treinamentos')) {
        return true;
      }
      return redirectSemAcesso(auth, router);
    })
  );
};
