import { inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { EMPTY, catchError, pipe, switchMap, tap } from 'rxjs';
import type { LoginRequest, PublicAgentDto } from '@pulsedesk/contracts/auth';
import { AuthApiService } from './auth-api.service';

export interface AuthState {
  agent: PublicAgentDto | null;
  loading: boolean;
  error: string | null;
}

const initialState: AuthState = {
  agent: null,
  loading: false,
  error: null,
};

/**
 * Agent session state, in-memory only. There is no `GET /auth/me` endpoint
 * today (see `apps/api/src/auth/`), so a hard page reload loses `agent` even
 * if the `pd_session` cookie is still valid — `authGuard` then bounces back
 * to `/login`, which re-authenticates against the still-valid cookie
 * transparently. A follow-up `/auth/me` endpoint would let the app resume a
 * session across reloads without asking for credentials again; out of scope
 * here.
 */
export const AuthStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withMethods((store) => {
    const api = inject(AuthApiService);

    const login = rxMethod<LoginRequest>(
      pipe(
        tap(() => patchState(store, { loading: true, error: null })),
        switchMap((credentials) =>
          api.login(credentials).pipe(
            tap(({ agent }) =>
              patchState(store, { agent, loading: false, error: null }),
            ),
            catchError((err: unknown) => {
              const message =
                err instanceof HttpErrorResponse && err.status === 401
                  ? 'Invalid email or password.'
                  : 'Could not sign in. Try again.';
              patchState(store, { loading: false, error: message });
              return EMPTY;
            }),
          ),
        ),
      ),
    );

    return {
      login,
      logout(): void {
        api.logout().subscribe();
        patchState(store, { agent: null });
      },
      /** Clears local session state without calling the backend — used when
       * a request already came back 401 (session expired/revoked server
       * side), so there is nothing left to log out of. */
      clearSession(): void {
        patchState(store, { agent: null });
      },
    };
  }),
);
