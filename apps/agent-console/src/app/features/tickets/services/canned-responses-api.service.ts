import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import type { CannedResponse } from '@pulsedesk/contracts/canned-responses';

const CANNED_RESPONSES_BASE_URL = '/api/canned-responses';

/** Thin HTTP wrapper around `GET /api/canned-responses` (see
 * `apps/api/src/canned-responses/canned-responses.controller.ts`). Same
 * `/api` proxy convention as `TicketsApiService` — no loading/error state of
 * its own, that lives in `CannedResponsesStore`. */
@Injectable({ providedIn: 'root' })
export class CannedResponsesApiService {
  private readonly http = inject(HttpClient);

  list(): Observable<CannedResponse[]> {
    return this.http.get<CannedResponse[]>(CANNED_RESPONSES_BASE_URL, {
      withCredentials: true,
    });
  }
}
