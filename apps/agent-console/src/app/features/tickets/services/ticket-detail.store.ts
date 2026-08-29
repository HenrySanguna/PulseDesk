import { inject } from '@angular/core';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { EMPTY, catchError, pipe, switchMap, tap } from 'rxjs';
import type { MessageVisibility, TicketStatus, TicketWithMessages } from '@pulsedesk/contracts/tickets';
import { TicketsApiService } from './tickets-api.service';

export interface TicketDetailState {
  currentId: string | null;
  ticket: TicketWithMessages | null;
  loading: boolean;
  error: string | null;
  claiming: boolean;
  updatingStatus: boolean;
  sendingMessage: boolean;
  actionError: string | null;
}

const initialState: TicketDetailState = {
  currentId: null,
  ticket: null,
  loading: false,
  error: null,
  claiming: false,
  updatingStatus: false,
  sendingMessage: false,
  actionError: null,
};

/** Single-ticket state for `pages/ticket-detail`: the message thread, and
 * the claim/status/reply actions. Every action re-fetches the ticket on
 * success instead of patching the response in place, so the agent always
 * sees the server's actual current state (assignee, status, full thread)
 * rather than an optimistic guess. */
export const TicketDetailStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withMethods((store) => {
    const api = inject(TicketsApiService);

    const load = rxMethod<string>(
      pipe(
        tap((id) =>
          patchState(store, { currentId: id, loading: true, error: null }),
        ),
        switchMap((id) =>
          api.getTicket(id).pipe(
            tap((ticket) => patchState(store, { ticket, loading: false })),
            catchError(() => {
              patchState(store, {
                loading: false,
                error: 'Could not load this ticket.',
              });
              return EMPTY;
            }),
          ),
        ),
      ),
    );

    const refresh = (): void => {
      const id = store.currentId();
      if (id) {
        load(id);
      }
    };

    return {
      load,
      refresh,
      claim(): void {
        const id = store.currentId();
        if (!id) {
          return;
        }
        patchState(store, { claiming: true, actionError: null });
        api.claimTicket(id).subscribe({
          next: () => {
            patchState(store, { claiming: false });
            refresh();
          },
          error: () => {
            patchState(store, {
              claiming: false,
              actionError:
                'This ticket was already claimed by another agent.',
            });
          },
        });
      },
      updateStatus(status: TicketStatus): void {
        const id = store.currentId();
        if (!id) {
          return;
        }
        patchState(store, { updatingStatus: true, actionError: null });
        api.updateStatus(id, { status }).subscribe({
          next: () => {
            patchState(store, { updatingStatus: false });
            refresh();
          },
          error: () => {
            patchState(store, {
              updatingStatus: false,
              actionError: 'That status change is not valid.',
            });
          },
        });
      },
      sendMessage(body: string, visibility: MessageVisibility): void {
        const id = store.currentId();
        if (!id) {
          return;
        }
        patchState(store, { sendingMessage: true, actionError: null });
        api.addMessage(id, { body, visibility }).subscribe({
          next: () => {
            patchState(store, { sendingMessage: false });
            refresh();
          },
          error: () => {
            patchState(store, {
              sendingMessage: false,
              actionError: 'Could not send the message.',
            });
          },
        });
      },
    };
  }),
);
