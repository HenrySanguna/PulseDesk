import { HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthStore } from '../features/auth/services/auth.store';

/** Redirects to `/login` on any `401` from the API (expired/revoked
 * session), except from the login request itself — a wrong password is a
 * normal 401 the login page shows inline, not a reason to navigate away
 * from itself. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const store = inject(AuthStore);
  const router = inject(Router);

  return next(req).pipe(
    catchError((err: unknown) => {
      if (
        err instanceof HttpErrorResponse &&
        err.status === 401 &&
        !req.url.includes('/auth/login')
      ) {
        store.clearSession();
        router.navigateByUrl('/login');
      }
      return throwError(() => err);
    }),
  );
};
