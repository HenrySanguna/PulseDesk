import { inject } from '@angular/core';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { EMPTY, catchError, pipe, switchMap, tap } from 'rxjs';
import type {
  ListTicketsQuery,
  Ticket,
  TicketPriority,
  TicketStatus,
} from '@pulsedesk/contracts/tickets';
import { TicketsApiService } from './tickets-api.service';

export interface TicketListFilters {
  status: TicketStatus | null;
  priority: TicketPriority | null;
  assigneeId: string | null;
}

export interface TicketListState {
  items: Ticket[];
  total: number;
  page: number;
  pageSize: number;
  filters: TicketListFilters;
  loading: boolean;
  error: string | null;
}

const initialState: TicketListState = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 20,
  filters: { status: null, priority: null, assigneeId: null },
  loading: false,
  error: null,
};

/** Ticket queue state for `pages/ticket-list`. Reload is always explicit
 * (a filter change, a page click, or the manual refresh button) — this
 * change ships REST-only, no websocket/polling push yet. */
export const TicketListStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withMethods((store) => {
    const api = inject(TicketsApiService);

    const loadPage = rxMethod<{ page: number; pageSize: number }>(
      pipe(
        tap(() => patchState(store, { loading: true, error: null })),
        switchMap(({ page, pageSize }) => {
          const filters = store.filters();
          const query: ListTicketsQuery = {
            page,
            pageSize,
            ...(filters.status ? { status: filters.status } : {}),
            ...(filters.priority ? { priority: filters.priority } : {}),
            ...(filters.assigneeId
              ? { assigneeId: filters.assigneeId }
              : {}),
          };
          return api.listTickets(query).pipe(
            tap((result) =>
              patchState(store, {
                items: result.items,
                total: result.total,
                page: result.page,
                pageSize: result.pageSize,
                loading: false,
              }),
            ),
            catchError(() => {
              patchState(store, {
                loading: false,
                error: 'Could not load tickets. Try refreshing.',
              });
              return EMPTY;
            }),
          );
        }),
      ),
    );

    return {
      loadPage,
      setFilters(filters: TicketListFilters): void {
        patchState(store, { filters });
        loadPage({ page: 1, pageSize: store.pageSize() });
      },
      refresh(): void {
        loadPage({ page: store.page(), pageSize: store.pageSize() });
      },
    };
  }),
);
