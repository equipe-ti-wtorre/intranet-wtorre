import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from '../services/auth.service';

/**
 * Redireciona para /inicio apenas quando a sessão é revalidada com sucesso.
 * Evita loop login↔inicio com tokens locais expirados/inválidos no storage.
 */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.temSessao()) {
    return true;
  }

  return auth.ensureSession().pipe(
    map((ok) => {
      if (ok && auth.temAccessValido()) {
        return router.createUrlTree(['/inicio']);
      }
      if (!ok) {
        auth.limparSessaoJwt();
      }
      return true;
    })
  );
};
