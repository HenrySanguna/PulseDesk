import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import type { LoginRequest, LoginResponse } from '@pulsedesk/contracts/auth';

const AUTH_BASE_URL = '/api/auth';

/**
 * Thin HTTP wrapper around `POST /api/auth/login` and `POST /api/auth/logout`
 * (see `apps/api/src/auth/auth.controller.ts`). Holds no state of its own —
 * that lives in `AuthStore`. `/api` is proxied to the Nest server in dev via
 * `proxy.conf.json`, same as `TicketsApiService`.
 */
@Injectable({ providedIn: 'root' })
export class AuthApiService {
  private readonly http = inject(HttpClient);

  login(body: LoginRequest): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${AUTH_BASE_URL}/login`, body, {
      withCredentials: true,
    });
  }

  logout(): Observable<{ success: true }> {
    return this.http.post<{ success: true }>(
      `${AUTH_BASE_URL}/logout`,
      {},
      { withCredentials: true },
    );
  }
}
