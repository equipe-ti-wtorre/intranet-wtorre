import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of, switchMap } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { CamarotesService } from '../services/camarotes.service';

/** Permite acesso à página BI / Camarotes apenas para visualizadores autorizados. */
export const camarotesViewerGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const camarotesService = inject(CamarotesService);
  const router = inject(Router);

  return auth.ensureSession().pipe(
    switchMap((ok) => {
      if (!ok) {
        return of(router.createUrlTree(['/login']));
      }

      if (auth.isAdmin() || auth.hasModulo('camarotes')) {
        return of(true);
      }

      return camarotesService.podeVisualizar().pipe(
        map((res) => (res.pode_visualizar ? true : router.createUrlTree(['/inicio']))),
        catchError(() => of(router.createUrlTree(['/inicio'])))
      );
    })
  );
};
