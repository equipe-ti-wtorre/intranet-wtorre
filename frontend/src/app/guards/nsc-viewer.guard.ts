import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of, switchMap } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { NscService } from '../services/nsc.service';

export const nscViewerGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const service = inject(NscService);
  const router = inject(Router);

  return auth.ensureSession().pipe(
    switchMap((ok) => {
      if (!ok) {
        return of(router.createUrlTree(['/login']));
      }

      if (auth.isAdmin() || auth.hasModulo('nao-se-cale')) {
        return of(true);
      }

      return service.podeVisualizar().pipe(
        map((res) => (res.pode_visualizar ? true : router.createUrlTree(['/inicio']))),
        catchError(() => of(router.createUrlTree(['/inicio'])))
      );
    })
  );
};
