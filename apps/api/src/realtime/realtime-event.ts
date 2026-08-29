/**
 * Wire shape of one dashboard realtime event — published to the Valkey
 * pub/sub channel AND appended to the short resume buffer (tasks.md 1.3/3.1).
 * `id` is a monotonically increasing Valkey `INCR` counter, used both as the
 * SSE `id:` field and as the `Last-Event-ID` resume cursor.
 */
export interface RealtimeEvent<TPayload = unknown> {
  id: number;
  type: string;
  payload: TPayload;
  ts: number;
}

/** Single Valkey pub/sub channel the dashboard SSE stream is backed by.
 * There is only one dashboard "room" today (tasks.md's out-of-scope note:
 * "cada dashboard abre una conexión SSE dedicada", not per-agent filtering). */
export const DASHBOARD_CHANNEL = 'pd:realtime:dashboard';

/** Valkey keys backing the resume buffer — a bounded, most-recent-N list
 * (tasks.md 1.3: "el servidor guarda un buffer corto de eventos recientes"). */
export const DASHBOARD_BUFFER_KEY = 'pd:realtime:dashboard:buffer';
export const DASHBOARD_SEQ_KEY = 'pd:realtime:dashboard:seq';
export const DASHBOARD_BUFFER_MAX_EVENTS = 200;

/** SSE comment heartbeat interval — tasks.md 1.2: "cada 20s para mantener la
 * conexión viva a través de proxies". */
export const SSE_HEARTBEAT_INTERVAL_MS = 20_000;

/** Event `type` values published on {@link DASHBOARD_CHANNEL}. Every value
 * carries a fresh `DashboardSnapshot` as its payload — simpler for
 * `DashboardStore` than replaying individual domain deltas client-side, and
 * always consistent since it's recomputed server-side at publish time. */
export const DASHBOARD_EVENT_TYPE = 'dashboard.snapshot' as const;

/** Narrow port `TicketsService`/`SlaClockService` depend on (constructor
 * `@Optional()`) instead of the concrete `RealtimeEventBusService` — same
 * port-interface convention as `SlaClockPort`/`AssignmentQueuePort`
 * (apps/api/src/sla). Optional because every existing unit/integration test
 * in this repo constructs those services directly with `new` and a fixed
 * argument list (see apps/api/src/tickets/tickets.service.spec.ts et al.) —
 * making this a required constructor argument would force editing every one
 * of those call sites just to add a no-op fake. `@Optional()` keeps the
 * feature fully wired in production (`RealtimeModule` is `@Global()`, so
 * real Nest DI always supplies it) while leaving every existing manual
 * `new TicketsService(...)`/`new SlaClockService(...)` call site unchanged. */
export interface RealtimeEventBusPort {
  publishDashboardSnapshot(): Promise<void>;
}
