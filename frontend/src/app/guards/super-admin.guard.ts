import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from '../services/auth.service';

export const superAdminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return auth.ensureSession().pipe(
    map((ok) => {
      if (ok && auth.isAdmin()) return true;

      const fallback = auth.primeiraRotaAdmin();
      if (fallback) {
        return router.createUrlTree(['/admin', fallback]);
      }
      return router.createUrlTree(['/inicio']);
    })
  );
};
