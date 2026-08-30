import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import {
  computeReconnectDelayMs,
  ticketPresenceRoomId,
} from '@pulsedesk/contracts/realtime';
import type {
  WsInboundMessage,
  WsMessage,
  WsParticipant,
} from '@pulsedesk/contracts/realtime';

export interface ConversationState {
  conversationId: string | null;
  messages: WsMessage[];
  typingFrom: WsParticipant | null;
  presentAgentIds: string[];
  connected: boolean;
  /** The ticket-scoped presence room (06-add-polish tasks.md 3.1/3.2) —
   * independent of `conversationId` above: every ticket gets one, whether
   * or not it has a linked widget conversation. See
   * `libs/contracts/src/lib/realtime.ts`'s `ticketPresenceRoomId` doc
   * comment for why this can safely share the SAME `ws` socket/`join`/
   * `leave`/`presence:update` mechanism as the chat room without colliding
   * with it. */
  ticketPresenceRoomId: string | null;
  ticketPresentAgentIds: string[];
}

const initialState: ConversationState = {
  conversationId: null,
  messages: [],
  typingFrom: null,
  presentAgentIds: [],
  connected: false,
  ticketPresenceRoomId: null,
  ticketPresentAgentIds: [],
};

/** How long a `typing` indicator stays visible after the last event, absent
 * a follow-up — the gateway never sends an explicit "stopped typing". */
const TYPING_INDICATOR_TIMEOUT_MS = 4000;

/**
 * Live conversation state for `pages/ticket-detail`, fed by the `ws` chat
 * channel (tasks.md 2.6) — a real `WebSocket` with hand-rolled reconnect +
 * exponential backoff (tasks.md 2.5; no native reconnect the way
 * `EventSource`/`DashboardStore` gets, see design.md). One persistent
 * connection per app session — `join()` switches conversations over the
 * SAME socket (`leave` the old room, `join` the new one) rather than
 * reconnecting on every ticket navigation.
 *
 * Agent-authored sends stay on the existing REST endpoint in this batch
 * (`TicketDetailStore.sendMessage` / `POST /tickets/:id/messages`) — this
 * store only RECEIVES over `ws` (live widget messages, typing, presence).
 * See `apps/api/src/realtime/conversation.gateway.ts`'s class doc comment /
 * tasks.md "Nota de alcance: envío de mensajes por ws para agentes".
 */
export const ConversationStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withMethods((store) => {
    let socket: WebSocket | null = null;
    let reconnectAttempt = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let typingClearTimer: ReturnType<typeof setTimeout> | undefined;
    let pendingConversationId: string | null = null;
    let pendingTicketPresenceRoomId: string | null = null;

    function wsUrl(): string {
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      // Same-origin only (dev: proxied by `proxy.conf.json`'s `/ws` entry).
      // `apps/agent-console` and `apps/api` deploy to different origins in
      // production (Fly.io / Cloudflare Pages) — routing this cross-origin
      // is a follow-up, same documented gap as `TicketsApiService`'s own
      // `/api` base URL.
      return `${proto}//${location.host}/ws`;
    }

    function send(event: string, data: unknown): void {
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ event, data }));
      }
    }

    function handleMessage(raw: MessageEvent<string>): void {
      let envelope: WsInboundMessage;
      try {
        envelope = JSON.parse(raw.data) as WsInboundMessage;
      } catch {
        return;
      }

      switch (envelope.event) {
        case 'joined':
        case 'presence:update':
          // One `conversationId`/room-key field on the wire serves BOTH the
          // chat room and the ticket-presence room (see
          // `ticketPresenceRoomId`'s doc comment) — route the update to
          // whichever local field actually owns that room key.
          if (envelope.data.conversationId === store.ticketPresenceRoomId()) {
            patchState(store, { ticketPresentAgentIds: envelope.data.agentIds });
          } else {
            patchState(store, { presentAgentIds: envelope.data.agentIds });
          }
          break;
        case 'message:new':
        case 'message:ack':
          patchState(store, (state) => {
            // A resent `clientMessageId` after a widget reconnect re-emits
            // the SAME message id (idempotent at the DB level, tasks.md
            // 5.4) — dedupe here so the console never shows it twice.
            if (state.messages.some((m) => m.id === envelope.data.id)) {
              return state;
            }
            return { messages: [...state.messages, envelope.data] };
          });
          break;
        case 'typing':
          clearTimeout(typingClearTimer);
          patchState(store, { typingFrom: envelope.data.from });
          typingClearTimer = setTimeout(() => {
            patchState(store, { typingFrom: null });
          }, TYPING_INDICATOR_TIMEOUT_MS);
          break;
        case 'error':
          // No dedicated UI surface for gateway errors in this scope —
          // logged for visibility during development.
          console.warn('ws error envelope:', envelope.data);
          break;
      }
    }

    function connectSocket(): void {
      socket = new WebSocket(wsUrl());
      socket.addEventListener('open', () => {
        reconnectAttempt = 0;
        patchState(store, { connected: true });
        if (pendingConversationId) {
          send('join', { conversationId: pendingConversationId });
        }
        if (pendingTicketPresenceRoomId) {
          send('join', { conversationId: pendingTicketPresenceRoomId });
        }
      });
      socket.addEventListener('message', handleMessage);
      socket.addEventListener('close', () => {
        patchState(store, { connected: false });
        socket = null;
        const delay = computeReconnectDelayMs(reconnectAttempt++);
        reconnectTimer = setTimeout(connectSocket, delay);
      });
      socket.addEventListener('error', () => socket?.close());
    }

    return {
      /** Joins `conversationId`'s room, opening the socket on first use. A
       * no-op if already joined to the exact same conversation. Leaves the
       * previously-joined room first (if the socket is actually open and
       * that room was actually joined) — the server's `ConversationRoomsService`
       * is purely additive (`join()` never evicts a prior room on its own),
       * so switching tickets without this leaves the agent's socket a
       * member of BOTH rooms: stale presence, and a `message:new`/`typing`
       * event from the ticket navigated away from bleeding into whatever
       * ticket is currently displayed (`handleMessage` has no
       * `conversationId` to filter incoming events by). Angular's default
       * `RouteReuseStrategy` keeps this component/store instance alive
       * across `:id` param changes, so this is a real, reachable path, not
       * a theoretical one. */
      join(conversationId: string): void {
        if (store.conversationId() === conversationId) {
          return;
        }
        const previousConversationId = store.conversationId();
        if (previousConversationId && socket?.readyState === WebSocket.OPEN) {
          send('leave', { conversationId: previousConversationId });
        }
        patchState(store, {
          conversationId,
          messages: [],
          typingFrom: null,
          presentAgentIds: [],
        });
        pendingConversationId = conversationId;
        if (!socket) {
          connectSocket();
        } else {
          send('join', { conversationId });
        }
      },
      leave(): void {
        const conversationId = store.conversationId();
        if (conversationId) {
          send('leave', { conversationId });
        }
        pendingConversationId = null;
        patchState(store, {
          conversationId: null,
          messages: [],
          typingFrom: null,
          presentAgentIds: [],
        });
      },
      notifyTyping(): void {
        if (store.conversationId()) {
          send('typing', {});
        }
      },
      /** Joins the ticket-scoped presence room (tasks.md 3.1/3.2) —
       * independent of, and always in addition to, whatever chat
       * `conversationId` room `join()` above manages. A no-op if already
       * joined to the exact same ticket's room; leaves the previous one
       * first for the same "switching tickets without leaving leaks
       * membership" reason `join()`'s doc comment explains. */
      joinTicketPresence(ticketId: string): void {
        const roomId = ticketPresenceRoomId(ticketId);
        if (store.ticketPresenceRoomId() === roomId) {
          return;
        }
        const previousRoomId = store.ticketPresenceRoomId();
        if (previousRoomId && socket?.readyState === WebSocket.OPEN) {
          send('leave', { conversationId: previousRoomId });
        }
        patchState(store, {
          ticketPresenceRoomId: roomId,
          ticketPresentAgentIds: [],
        });
        pendingTicketPresenceRoomId = roomId;
        if (!socket) {
          connectSocket();
        } else {
          send('join', { conversationId: roomId });
        }
      },
      leaveTicketPresence(): void {
        const roomId = store.ticketPresenceRoomId();
        if (roomId) {
          send('leave', { conversationId: roomId });
        }
        pendingTicketPresenceRoomId = null;
        patchState(store, { ticketPresenceRoomId: null, ticketPresentAgentIds: [] });
      },
      disconnect(): void {
        clearTimeout(reconnectTimer);
        clearTimeout(typingClearTimer);
        pendingConversationId = null;
        pendingTicketPresenceRoomId = null;
        socket?.close();
        socket = null;
      },
    };
  }),
);
