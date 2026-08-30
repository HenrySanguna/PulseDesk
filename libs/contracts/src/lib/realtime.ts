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

/** Mirrors `libs/db/src/queries/agent-load.query.ts`'s `AgentLoad` — served
 * over plain REST (`GET /realtime/dashboard/agent-load`, 06-add-polish
 * tasks.md 2.1), not SSE. `lastAssignedAt` travels as an ISO string like
 * every other date on the wire (see `libs/contracts/src/lib/tickets.ts`'s
 * doc comment). */
export interface AgentLoad {
  agentId: string;
  agentEmail: string;
  activeTicketCount: number;
  maxCapacity: number;
  loadRank: number;
  lastAssignedAt: string | null;
}

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

/**
 * Room-key format for a ticket's agent-presence room (06-add-polish
 * tasks.md 3.1/3.2) — reuses the EXACT `join`/`leave`/`presence:update` `ws`
 * mechanism `05-add-realtime-hybrid` built for widget conversations,
 * `apps/api/src/realtime/conversation.gateway.ts`'s `handleJoin` accepts
 * any string as a room key from an agent socket (no server-side validation
 * against a real `Conversation` row), so a second, deliberately distinct
 * key namespace is enough to get ticket-level presence "for free" without
 * any backend change: every ticket gets a presence room, including
 * agent-created tickets that have no widget `Conversation` at all (the
 * existing conversationId-keyed room only ever exists for widget-linked
 * tickets). Prefixed so it can never collide with a real `Conversation.id`
 * UUID (a different table's id space entirely, but the prefix makes the
 * non-collision obvious by inspection too, not just by argument).
 */
export function ticketPresenceRoomId(ticketId: string): string {
  return `ticket:${ticketId}`;
}

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
