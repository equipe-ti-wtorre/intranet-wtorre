import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';
import {
  TabletAuthService,
  isTabletApiUrl,
  isTabletAuthPublic,
} from '../services/tablet-auth.service';
import {
  RamalAuthService,
  isRamalApiUrl,
  isRamalAuthPublic,
} from '../services/ramal-auth.service';

const PUBLIC_PATHS = [
  '/auth/login',
  '/auth/login-microsoft',
  '/auth/refresh',
  '/tenants/msal-config',
  '/branding/',
  '/assinaturas/instalar-assinaturas.ps1',
  '/assinaturas/instalar-assinaturas-base.ps1',
  '/assinaturas/config/',
  '/pesquisas/publico/',
];

function isApiRequest(url: string): boolean {
  return url.includes('/api/v1') || url.startsWith('/api/');
}

function isPublic(url: string): boolean {
  if (!isApiRequest(url)) return true;
  if (isTabletAuthPublic(url)) return true;
  if (isRamalAuthPublic(url)) return true;
  return PUBLIC_PATHS.some((p) => url.includes(p));
}

function usesGraphToken(url: string): boolean {
  return isApiRequest(url) && url.includes('/assinaturas/me');
}

function shouldAttachIntranetToken(url: string): boolean {
  return (
    isApiRequest(url) &&
    !isPublic(url) &&
    !usesGraphToken(url) &&
    !isTabletApiUrl(url) &&
    !isRamalApiUrl(url)
  );
}

function tokenRenovado(refreshed: { accessToken?: string; token?: string } | null): string | null {
  return refreshed?.accessToken || refreshed?.token || null;
}

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const tabletAuth = inject(TabletAuthService);
  const ramalAuth = inject(RamalAuthService);
  let request = req;

  if (isTabletApiUrl(req.url)) {
    const tabletToken = tabletAuth.getToken();
    if (tabletToken && !isTabletAuthPublic(req.url)) {
      request = req.clone({
        setHeaders: { Authorization: `Bearer ${tabletToken}` },
      });
    }

    return next(request).pipe(
      catchError((err: HttpErrorResponse) => {
        if (
          err.status !== 401 ||
          isTabletAuthPublic(req.url) ||
          req.url.includes('/tablet/auth/refresh')
        ) {
          return throwError(() => err);
        }

        const onLoginPage =
          typeof window !== 'undefined' && window.location.pathname.startsWith('/tablet/login');

        return tabletAuth.refresh().pipe(
          switchMap((refreshed) => {
            const newToken = tokenRenovado(refreshed);
            if (newToken) {
              const retry = req.clone({
                setHeaders: { Authorization: `Bearer ${newToken}` },
              });
              return next(retry);
            }
            tabletAuth.limparSessao();
            if (!onLoginPage) {
              tabletAuth.irParaLogin();
            }
            return throwError(() => err);
          }),
          catchError(() => {
            tabletAuth.limparSessao();
            if (!onLoginPage) {
              tabletAuth.irParaLogin();
            }
            return throwError(() => err);
          })
        );
      })
    );
  }

  if (isRamalApiUrl(req.url)) {
    const ramalToken = ramalAuth.getToken();
    if (ramalToken && !isRamalAuthPublic(req.url)) {
      request = req.clone({
        setHeaders: { Authorization: `Bearer ${ramalToken}` },
      });
    }

    return next(request).pipe(
      catchError((err: HttpErrorResponse) => {
        if (
          err.status !== 401 ||
          isRamalAuthPublic(req.url) ||
          req.url.includes('/ramal/auth/refresh')
        ) {
          return throwError(() => err);
        }

        const onLoginPage =
          typeof window !== 'undefined' && window.location.pathname.startsWith('/ramal/login');

        return ramalAuth.refresh().pipe(
          switchMap((refreshed) => {
            const newToken = tokenRenovado(refreshed);
            if (newToken) {
              const retry = req.clone({
                setHeaders: { Authorization: `Bearer ${newToken}` },
              });
              return next(retry);
            }
            ramalAuth.limparSessao();
            if (!onLoginPage) {
              ramalAuth.irParaLogin();
            }
            return throwError(() => err);
          }),
          catchError(() => {
            ramalAuth.limparSessao();
            if (!onLoginPage) {
              ramalAuth.irParaLogin();
            }
            return throwError(() => err);
          })
        );
      })
    );
  }

  const token = auth.getToken();
  if (token && shouldAttachIntranetToken(req.url)) {
    request = req.clone({
      setHeaders: { Authorization: `Bearer ${token}` },
    });
  }

  return next(request).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status !== 401 || isPublic(req.url) || req.url.includes('/auth/refresh')) {
        return throwError(() => err);
      }

      const onLoginPage =
        typeof window !== 'undefined' && window.location.pathname.startsWith('/login');

      return auth.refresh().pipe(
        switchMap((refreshed) => {
          const newToken = tokenRenovado(refreshed);
          if (newToken) {
            const retry = req.clone({
              setHeaders: { Authorization: `Bearer ${newToken}` },
            });
            return next(retry);
          }
          if (auth.temAccessValido() || auth.temSessao()) {
            auth.limparSessao();
          }
          if (!onLoginPage) {
            void auth.irParaLogin();
          }
          return throwError(() => err);
        }),
        catchError(() => {
          if (auth.temSessao()) auth.limparSessao();
          if (!onLoginPage) {
            void auth.irParaLogin();
          }
          return throwError(() => err);
        })
      );
    })
  );
};
