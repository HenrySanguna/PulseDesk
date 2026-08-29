import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';

const CONVERSATIONS_URL = '/api/widget/conversations';
const CUSTOMER_SESSION_STORAGE_KEY = 'pd_widget_customer_session_id';

export interface CreateConversationResponse {
  conversationId: string;
  token: string;
}

/** Reads (or creates and persists) the anonymous client-generated visitor
 * id `POST /widget/conversations` needs — see `widget.prisma`'s
 * `Customer.sessionId` doc comment. Persisted in `localStorage` so a
 * returning visitor recovers the same conversation across page loads. */
function readOrCreateCustomerSessionId(): string {
  const existing = localStorage.getItem(CUSTOMER_SESSION_STORAGE_KEY);
  if (existing) {
    return existing;
  }
  const created = crypto.randomUUID();
  localStorage.setItem(CUSTOMER_SESSION_STORAGE_KEY, created);
  return created;
}

/** Thin HTTP wrapper around `POST /api/widget/conversations` (see
 * `apps/api/src/widget/widget.controller.ts`). `/api` is proxied to the
 * Nest server in dev via `proxy.conf.json`, same convention as
 * `apps/agent-console`'s `TicketsApiService`. */
@Injectable({ providedIn: 'root' })
export class WidgetConversationService {
  private readonly http = inject(HttpClient);

  createOrRecoverConversation(): Observable<CreateConversationResponse> {
    const customerSessionId = readOrCreateCustomerSessionId();
    return this.http.post<CreateConversationResponse>(CONVERSATIONS_URL, {
      customerSessionId,
    });
  }
}
