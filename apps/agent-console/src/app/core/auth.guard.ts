import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { AuthStore } from '../features/auth/services/auth.store';

/** Blocks protected routes (the ticket queue) unless `AuthStore` already
 * holds an authenticated agent. See `AuthStore` for why this is in-memory
 * only and does not survive a hard page reload. */
export const authGuard: CanActivateFn = () => {
  const store = inject(AuthStore);
  const router = inject(Router);

  if (store.agent()) {
    return true;
  }

  return router.createUrlTree(['/login']);
};
