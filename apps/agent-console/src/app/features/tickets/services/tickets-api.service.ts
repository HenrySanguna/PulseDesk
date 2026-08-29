import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import type {
  CreateMessageRequest,
  ListTicketsQuery,
  ListTicketsResult,
  Message,
  Ticket,
  TicketWithMessages,
  UpdateTicketStatusRequest,
} from '@pulsedesk/contracts/tickets';

const TICKETS_BASE_URL = '/api/tickets';

/**
 * Thin HTTP wrapper around `GET/POST/PATCH /api/tickets*` (see
 * `apps/api/src/tickets/tickets.controller.ts` for the exact contract).
 * Holds no loading/error state of its own — that lives in this feature's
 * SignalStores (`TicketListStore`, `TicketDetailStore`), per
 * `openspec/project.md`'s `@ngrx/signals` (SignalStore) state convention.
 *
 * `/api` is proxied to the Nest server in dev via `proxy.conf.json`
 * (`nx serve agent-console`); routing it in production is a follow-up, since
 * `apps/api` and `apps/agent-console` deploy to different origins
 * (Fly.io / Cloudflare Pages per `openspec/project.md`).
 */
@Injectable({ providedIn: 'root' })
export class TicketsApiService {
  private readonly http = inject(HttpClient);

  listTickets(query: ListTicketsQuery): Observable<ListTicketsResult> {
    let params = new HttpParams();
    if (query.status) {
      params = params.set('status', query.status);
    }
    if (query.priority) {
      params = params.set('priority', query.priority);
    }
    if (query.assigneeId) {
      params = params.set('assigneeId', query.assigneeId);
    }
    if (query.page) {
      params = params.set('page', query.page);
    }
    if (query.pageSize) {
      params = params.set('pageSize', query.pageSize);
    }

    return this.http.get<ListTicketsResult>(TICKETS_BASE_URL, {
      params,
      withCredentials: true,
    });
  }

  getTicket(id: string): Observable<TicketWithMessages> {
    return this.http.get<TicketWithMessages>(`${TICKETS_BASE_URL}/${id}`, {
      withCredentials: true,
    });
  }

  claimTicket(id: string): Observable<Ticket> {
    return this.http.post<Ticket>(
      `${TICKETS_BASE_URL}/${id}/claim`,
      {},
      { withCredentials: true },
    );
  }

  updateStatus(
    id: string,
    body: UpdateTicketStatusRequest,
  ): Observable<Ticket> {
    return this.http.patch<Ticket>(`${TICKETS_BASE_URL}/${id}/status`, body, {
      withCredentials: true,
    });
  }

  addMessage(id: string, body: CreateMessageRequest): Observable<Message> {
    return this.http.post<Message>(
      `${TICKETS_BASE_URL}/${id}/messages`,
      body,
      { withCredentials: true },
    );
  }
}
