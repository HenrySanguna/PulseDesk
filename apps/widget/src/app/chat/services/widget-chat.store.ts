import { inject } from '@angular/core';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { computeReconnectDelayMs } from '@pulsedesk/contracts/realtime';
import type { WsInboundMessage, WsMessage } from '@pulsedesk/contracts/realtime';
import { WidgetConversationService } from './widget-conversation.service';

export interface WidgetChatState {
  conversationId: string | null;
  connected: boolean;
  messages: WsMessage[];
  agentTyping: boolean;
  sending: boolean;
  error: string | null;
}

const initialState: WidgetChatState = {
  conversationId: null,
  connected: false,
  messages: [],
  agentTyping: false,
  sending: false,
  error: null,
};

const TYPING_INDICATOR_TIMEOUT_MS = 4000;
const TYPING_THROTTLE_MS = 2000;

function wsUrl(token: string): string {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  // Same-origin only (dev: proxied by `proxy.conf.json`'s `/ws` entry) —
  // see `ConversationStore`'s matching note on the production cross-origin
  // follow-up.
  return `${proto}//${location.host}/ws?token=${encodeURIComponent(token)}`;
}

/**
 * The widget's own `ws` chat client (tasks.md 2.5/4.1/4.2) — a real,
 * embeddable chat page: creates/recovers a conversation over REST, then
 * connects and stays connected over `ws` with exponential backoff on
 * disconnect (no native reconnect for `ws`, unlike `EventSource` — see
 * design.md). Every outgoing message carries a client-generated
 * `clientMessageId` (`crypto.randomUUID()`), which is what makes a resend
 * after a dropped connection idempotent server-side (tasks.md 4.2, proven
 * by test 5.4) — this store also re-sends any message still awaiting its
 * `message:ack` after a reconnect, using the SAME `clientMessageId`.
 */
export const WidgetChatStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withMethods((store) => {
    const conversations = inject(WidgetConversationService);
    let socket: WebSocket | null = null;
    let token: string | null = null;
    let reconnectAttempt = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let typingClearTimer: ReturnType<typeof setTimeout> | undefined;
    /** Messages sent but not yet acknowledged — resent verbatim (same
     * `clientMessageId`) after a reconnect, since the client can't know
     * whether the original send actually reached the server before the
     * drop. */
    const pendingSends = new Map<string, string>();
    let lastTypingSentAt = 0;

    function send(event: string, data: unknown): void {
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ event, data }));
      }
    }

    function appendMessage(message: WsMessage): void {
      patchState(store, (state) => {
        if (state.messages.some((m) => m.id === message.id)) {
          return state;
        }
        return { messages: [...state.messages, message] };
      });
      if (message.clientMessageId) {
        pendingSends.delete(message.clientMessageId);
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
        case 'message:new':
        case 'message:ack':
          patchState(store, { sending: false });
          appendMessage(envelope.data);
          break;
        case 'typing':
          if (envelope.data.from.kind === 'agent') {
            clearTimeout(typingClearTimer);
            patchState(store, { agentTyping: true });
            typingClearTimer = setTimeout(() => {
              patchState(store, { agentTyping: false });
            }, TYPING_INDICATOR_TIMEOUT_MS);
          }
          break;
        case 'error':
          patchState(store, { sending: false, error: envelope.data.message });
          break;
        default:
          break;
      }
    }

    function connectSocket(): void {
      if (!token) {
        return;
      }
      socket = new WebSocket(wsUrl(token));
      socket.addEventListener('open', () => {
        reconnectAttempt = 0;
        patchState(store, { connected: true, error: null });
        // Re-send anything still awaiting an ack from before the drop.
        for (const [clientMessageId, body] of pendingSends) {
          send('message:send', { body, clientMessageId });
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
      /** Creates/recovers the conversation and opens the `ws` connection —
       * called once from the chat page's constructor. */
      init(): void {
        conversations.createOrRecoverConversation().subscribe({
          next: (result) => {
            token = result.token;
            patchState(store, { conversationId: result.conversationId, error: null });
            connectSocket();
          },
          error: () => {
            patchState(store, { error: 'Could not start the chat. Try reloading.' });
          },
        });
      },
      sendMessage(body: string): void {
        const trimmed = body.trim();
        if (!trimmed) {
          return;
        }
        const clientMessageId = crypto.randomUUID();
        pendingSends.set(clientMessageId, trimmed);
        patchState(store, { sending: true, error: null });
        send('message:send', { body: trimmed, clientMessageId });
      },
      /** Throttled to at most once every `TYPING_THROTTLE_MS` — called on
       * every keystroke by the chat page, would otherwise flood the socket. */
      notifyTyping(): void {
        const now = Date.now();
        if (now - lastTypingSentAt < TYPING_THROTTLE_MS) {
          return;
        }
        lastTypingSentAt = now;
        send('typing', {});
      },
      disconnect(): void {
        clearTimeout(reconnectTimer);
        clearTimeout(typingClearTimer);
        socket?.close();
        socket = null;
      },
    };
  }),
);
