import { TestBed } from '@angular/core/testing';
import { ticketPresenceRoomId } from '@pulsedesk/contracts/realtime';
import { ConversationStore } from './conversation.store';

/**
 * Minimal fake `WebSocket` — enough to drive `ConversationStore.handleMessage`
 * without a real server. Mirrors the exact surface the store actually calls
 * (`addEventListener`, `send`, `close`, `readyState`/`OPEN`), nothing more.
 */
class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readyState = FakeWebSocket.OPEN;
  private readonly listeners = new Map<string, Array<(event: unknown) => void>>();

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: (event: unknown) => void): void {
    const existing = this.listeners.get(type) ?? [];
    existing.push(listener);
    this.listeners.set(type, existing);
  }

  send(): void {
    // Outgoing frames aren't under test here — only the inbound
    // `handleMessage` routing switch is (see the two `it`s below).
  }

  close(): void {
    this.readyState = FakeWebSocket.CLOSED;
  }

  /** Test helper: simulates the server dispatching `type` to this socket. */
  dispatch(type: string, event: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

/**
 * Closes CRITICAL 1's client-side gap (06-add-polish verify-report.md):
 * `handleMessage`'s `presence:update` routing switch — comparing
 * `envelope.data.conversationId` against `store.ticketPresenceRoomId()` to
 * decide whether an incoming presence broadcast belongs to the ticket
 * presence room or the widget chat room — is plain, deterministic
 * TypeScript with no external dependency, so a fake `WebSocket` is enough to
 * prove it without a live server. The server-side half of the same spec
 * scenario ("el primer agente recibe un aviso") is proven separately by
 * `apps/api/src/realtime/conversation-gateway.integration.spec.ts`'s new
 * ticket-presence test (real Nest app + real `ws` clients).
 */
describe('ConversationStore — handleMessage presence:update routing', () => {
  let originalWebSocket: typeof WebSocket;

  beforeEach(() => {
    FakeWebSocket.instances = [];
    originalWebSocket = globalThis.WebSocket;
    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    globalThis.WebSocket = originalWebSocket;
  });

  it('updates ticketPresentAgentIds (not presentAgentIds) for a presence:update on the ticket-presence room', () => {
    const store = TestBed.inject(ConversationStore);
    store.join('conv-1');
    store.joinTicketPresence('ticket-1');

    // `join()` and `joinTicketPresence()` share the SAME one socket
    // (tasks.md 3.1) — there is exactly one FakeWebSocket instance here.
    const socket = FakeWebSocket.instances[FakeWebSocket.instances.length - 1];

    socket.dispatch('message', {
      data: JSON.stringify({
        event: 'presence:update',
        data: {
          conversationId: ticketPresenceRoomId('ticket-1'),
          agentIds: ['agent-a', 'agent-b'],
        },
      }),
    });

    expect(store.ticketPresentAgentIds()).toEqual(['agent-a', 'agent-b']);
    expect(store.presentAgentIds()).toEqual([]);

    store.disconnect();
  });

  it('updates presentAgentIds (not ticketPresentAgentIds) for a presence:update on the chat conversation room', () => {
    const store = TestBed.inject(ConversationStore);
    store.join('conv-1');
    store.joinTicketPresence('ticket-1');

    const socket = FakeWebSocket.instances[FakeWebSocket.instances.length - 1];

    socket.dispatch('message', {
      data: JSON.stringify({
        event: 'presence:update',
        data: { conversationId: 'conv-1', agentIds: ['agent-a'] },
      }),
    });

    expect(store.presentAgentIds()).toEqual(['agent-a']);
    expect(store.ticketPresentAgentIds()).toEqual([]);

    store.disconnect();
  });
});
