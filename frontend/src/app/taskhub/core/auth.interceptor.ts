import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from './auth.service';

const withToken = (req: HttpRequest<unknown>, token: string | null) =>
  token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const isAuthCall = /\/auth\/(login|refresh|logout)$/.test(req.url);

  return next(withToken(req, auth.token())).pipe(
    catchError((err: HttpErrorResponse) => {
      if (isAuthCall) return throwError(() => err);
      if (err.status === 401 && err.error?.code === 'TOKEN_EXPIRED') {
        return auth.refresh().pipe(
          switchMap(token => next(withToken(req, token))),
          catchError(e => { auth.clear(); return throwError(() => e); }),
        );
      }
      if (err.status === 401) auth.clear();
      if (err.status === 403 && err.error?.code === 'PASSWORD_CHANGE_REQUIRED') router.navigate(['/ti/taskhub/trocar-senha']);
      return throwError(() => err);
    }),
  );
};
