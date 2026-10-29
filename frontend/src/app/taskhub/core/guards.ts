import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.isLoggedIn() ? true : inject(Router).createUrlTree(['/ti/taskhub/entrar']);
};

export const passwordGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.user()?.must_change_password ? inject(Router).createUrlTree(['/ti/taskhub/trocar-senha']) : true;
};

export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.isLoggedIn() ? inject(Router).createUrlTree(['/ti/taskhub/meu-dia']) : true;
};

// Administração (setores e perfis): só quem administra todas as pessoas.
export const fullAdminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.canManageUsers() === 'all' ? true : inject(Router).createUrlTree(['/ti/taskhub/meu-dia']);
};

// Pessoas: só o administrador, e ele cai na aba Pessoas de Administração.
export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.canManageUsers() === 'all'
    ? router.createUrlTree(['/ti/taskhub/administracao'], { queryParams: { aba: 'pessoas' } })
    : router.createUrlTree(['/ti/taskhub/meu-dia']);
};
