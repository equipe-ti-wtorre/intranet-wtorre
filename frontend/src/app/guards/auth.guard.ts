import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from '../services/auth.service';

/** Protege rotas que exigem autenticação JWT. */
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.temAccessValido()) {
    return true;
  }

  return auth.ensureSession().pipe(
    map((ok) => (ok || auth.temAccessValido() ? true : router.createUrlTree(['/login'])))
  );
};
