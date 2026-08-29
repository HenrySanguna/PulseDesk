import { inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { DASHBOARD_EVENT_TYPE, type DashboardSnapshot } from '@pulsedesk/contracts/realtime';

export interface DashboardState {
  snapshot: DashboardSnapshot | null;
  connected: boolean;
  error: string | null;
}

const initialState: DashboardState = {
  snapshot: null,
  connected: false,
  error: null,
};

const SNAPSHOT_URL = '/api/realtime/dashboard/snapshot';
const STREAM_URL = '/api/realtime/dashboard';

/**
 * Live dashboard counters (tasks.md 1.4), fed by SSE. Unlike
 * `ConversationStore`'s `ws`, `EventSource` reconnects on its own — no
 * manual backoff code here, and it resends `Last-Event-ID` automatically on
 * every reconnect attempt, which is what makes `RealtimeSseService`'s
 * resume buffer (tasks.md 1.3) actually reachable from a real browser
 * without any client-side bookkeeping.
 *
 * Every event on the stream already carries a FRESH, fully-recomputed
 * `DashboardSnapshot` (see `RealtimeEventBusService.publishDashboardSnapshot`)
 * — this store just replaces `snapshot` wholesale on each one, no client-side
 * delta application.
 */
export const DashboardStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withMethods((store) => {
    const http = inject(HttpClient);
    let eventSource: EventSource | null = null;

    return {
      /** Idempotent — safe to call from every page that shows the
       * dashboard; the underlying `EventSource` is opened once per app
       * session. */
      connect(): void {
        http
          .get<DashboardSnapshot>(SNAPSHOT_URL, { withCredentials: true })
          .subscribe({
            next: (snapshot) => patchState(store, { snapshot, error: null }),
            error: () =>
              patchState(store, { error: 'Could not load the dashboard.' }),
          });

        if (eventSource) {
          return;
        }
        eventSource = new EventSource(STREAM_URL, { withCredentials: true });
        eventSource.addEventListener('open', () => {
          patchState(store, { connected: true, error: null });
        });
        eventSource.addEventListener(DASHBOARD_EVENT_TYPE, (event) => {
          const messageEvent = event as MessageEvent<string>;
          try {
            const snapshot = JSON.parse(messageEvent.data) as DashboardSnapshot;
            patchState(store, { snapshot, connected: true, error: null });
          } catch {
            // Malformed frame — ignore, the next one will self-correct.
          }
        });
        eventSource.addEventListener('error', () => {
          // The browser retries on its own; just reflect the current gap.
          patchState(store, { connected: false });
        });
      },
      disconnect(): void {
        eventSource?.close();
        eventSource = null;
        patchState(store, { connected: false });
      },
    };
  }),
);
