import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of, switchMap } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { SolicitacaoColaboradorService } from '../services/solicitacao-colaborador.service';

export const solicitacaoViewerGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const service = inject(SolicitacaoColaboradorService);
  const router = inject(Router);

  return auth.ensureSession().pipe(
    switchMap((ok) => {
      if (!ok) {
        return of(router.createUrlTree(['/login']));
      }

      if (auth.isAdmin() || auth.hasModulo('solicitacao-colaborador')) {
        return of(true);
      }

      return service.podeVisualizar().pipe(
        map((res) => (res.pode_visualizar ? true : router.createUrlTree(['/inicio']))),
        catchError(() => of(router.createUrlTree(['/inicio'])))
      );
    })
  );
};
