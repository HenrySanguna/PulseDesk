import { inject } from '@angular/core';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import type { CannedResponse } from '@pulsedesk/contracts/canned-responses';
import { CannedResponsesApiService } from './canned-responses-api.service';

export interface CannedResponsesState {
  items: CannedResponse[];
  loaded: boolean;
  loading: boolean;
  error: string | null;
}

const initialState: CannedResponsesState = {
  items: [],
  loaded: false,
  loading: false,
  error: null,
};

/**
 * The shared canned-response library (tasks.md 1.1/1.2), loaded once and
 * kept in memory for the whole session — this is a small, rarely-changing
 * shared list, not per-ticket data, so there is no live/SSE refresh the way
 * `DashboardStore` has: `ensureLoaded()` is idempotent and safe to call from
 * every place that offers the `/shortcut` autocomplete.
 */
export const CannedResponsesStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withMethods((store) => {
    const api = inject(CannedResponsesApiService);

    return {
      ensureLoaded(): void {
        if (store.loaded() || store.loading()) {
          return;
        }
        patchState(store, { loading: true, error: null });
        api.list().subscribe({
          next: (items) => patchState(store, { items, loaded: true, loading: false }),
          error: () =>
            patchState(store, {
              loading: false,
              error: 'Could not load canned responses.',
            }),
        });
      },
    };
  }),
);
