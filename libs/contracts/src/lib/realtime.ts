/**
 * Realtime domain contracts shared between `apps/api`, `apps/agent-console`,
 * and `apps/widget` (`05-add-realtime-hybrid`). See
 * `libs/contracts/src/lib/tickets.ts` for why these hand-mirror the API's
 * wire shapes instead of importing `apps/api`/`@pulsedesk/db` types
 * directly (`scope:web` can't depend on `type:data`).
 */

// --- SSE dashboard channel (tasks.md section 1) ---------------------------

/** Mirrors `libs/db/src/queries/dashboard-snapshot.query.ts`'s
 * `DashboardSnapshot` — every field is already a plain number/null, no
 * date-to-ISO-string conversion needed on the wire. */
export interface DashboardSnapshot {
  totalTickets: number;
  newCount: number;
  openCount: number;
  pendingCount: number;
  resolvedCount: number;
  closedCount: number;
  firstResponseP50Minutes: number | null;
  firstResponseP90Minutes: number | null;
  atRiskCount: number;
}

/** SSE `event:` field value every `dashboard.snapshot` message carries —
 * mirrors `apps/api/src/realtime/realtime-event.ts`'s `DASHBOARD_EVENT_TYPE`. */
export const DASHBOARD_EVENT_TYPE = 'dashboard.snapshot';

// --- ws chat channel (tasks.md section 2) ---------------------------------

/** Mirrors `apps/api/src/realtime/native-ws.adapter.ts`'s `WS_PATH`. */
export const WS_PATH = '/ws';

/** Mirrors the wire shape `apps/api/src/realtime/conversation.gateway.ts`'s
 * `toWireMessage()` sends — a JSON-safe projection of `@pulsedesk/db`'s
 * `Message` (see `libs/contracts/src/lib/tickets.ts`'s `Message` for the
 * REST equivalent; kept as a separate type here since the `ws` and REST
 * surfaces are independently maintained per design.md's "sin abstracción
 * común forzada"). */
export interface WsMessage {
  id: string;
  ticketId: string;
  authorAgentId: string | null;
  visibility: string;
  body: string;
  clientMessageId: string | null;
  createdAt: string;
}

/** Presence/typing participant identity, mirrors
 * `apps/api/src/realtime/ws-auth.ts`'s `WsAuthContext` (minus the fields a
 * client never needs to know, like `customerId`). */
export type WsParticipant = { kind: 'agent'; agentId: string } | { kind: 'widget' };

export interface WsJoinedPayload {
  conversationId: string;
  agentIds: string[];
}

export interface WsPresenceUpdatePayload {
  conversationId: string;
  agentIds: string[];
}

export interface WsTypingPayload {
  conversationId: string;
  from: WsParticipant;
}

export interface WsErrorPayload {
  message: string;
}

/** Every `{event, data}` envelope the client can SEND — matches
 * `ConversationGateway`'s `@SubscribeMessage` handlers exactly. */
export type WsOutboundMessage =
  | { event: 'join'; data: { conversationId: string } }
  | { event: 'leave'; data: { conversationId: string } }
  | { event: 'message:send'; data: { body: string; clientMessageId: string } }
  | { event: 'typing'; data: Record<string, never> };

/** Every `{event, data}` envelope the client can RECEIVE. */
export type WsInboundMessage =
  | { event: 'joined'; data: WsJoinedPayload }
  | { event: 'message:ack'; data: WsMessage }
  | { event: 'message:new'; data: WsMessage }
  | { event: 'typing'; data: WsTypingPayload }
  | { event: 'presence:update'; data: WsPresenceUpdatePayload }
  | { event: 'error'; data: WsErrorPayload };

// --- Reconnect backoff -----------------------------------------------------

export interface BackoffOptions {
  baseDelayMs?: number;
  maxDelayMs?: number;
}

const DEFAULT_BACKOFF: Required<BackoffOptions> = {
  baseDelayMs: 500,
  maxDelayMs: 15_000,
};

/**
 * Deterministic exponential backoff delay (no jitter — kept pure/testable)
 * for the `attempt`th reconnect (0-indexed). Only the `ws` clients need
 * this: `EventSource` reconnects on its own natively (design.md), a raw
 * `WebSocket` does not (tasks.md 2.5 "Cliente WebSocket propio con backoff
 * exponencial").
 */
export function computeReconnectDelayMs(attempt: number, options: BackoffOptions = {}): number {
  const { baseDelayMs, maxDelayMs } = { ...DEFAULT_BACKOFF, ...options };
  const delay = baseDelayMs * 2 ** Math.max(attempt, 0);
  return Math.min(delay, maxDelayMs);
}
