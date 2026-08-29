import { AbstractWsAdapter } from '@nestjs/websockets';
import type { WsMessageHandler } from '@nestjs/common/interfaces';
import type { Observable } from 'rxjs';
import { WebSocketServer, type RawData, type WebSocket } from 'ws';

/** `ws`'s server-side `close` frame event name — the default
 * `AbstractWsAdapter.bindClientDisconnect` listens for `'disconnect'`
 * (a Socket.IO-only event name), so it MUST be overridden here; a raw `ws`
 * `WebSocket` never emits `'disconnect'`, only `'close'`. */
const WS_CLOSE_EVENT = 'close';

export const WS_PATH = '/ws';
/** Bounded frame size (tasks.md 2.1) — design.md's exact number. */
export const WS_MAX_PAYLOAD_BYTES = 64 * 1024;

interface WsEnvelope {
  event: string;
  data: unknown;
}

function isWsEnvelope(value: unknown): value is WsEnvelope {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { event?: unknown }).event === 'string'
  );
}

/**
 * `ws`-native `WebSocketAdapter` (tasks.md 2.1, design.md "Por qué `ws`
 * nativo... sin Socket.IO"). No `@nestjs/platform-ws`/Socket.IO package
 * involved: `create()` attaches a plain `ws.WebSocketServer` to the same
 * underlying HTTP server Fastify listens on, and `bindMessageHandlers`
 * hand-implements the `{event, data}` message envelope Nest's
 * `@SubscribeMessage`/`@MessageBody`/`@ConnectedSocket` decorators expect —
 * the one piece of plumbing Socket.IO would otherwise give for free.
 */
export class NativeWsAdapter extends AbstractWsAdapter<WebSocketServer, WebSocket> {
  create(_port: number, options?: { path?: string }): WebSocketServer {
    return new WebSocketServer({
      server: this.httpServer,
      path: options?.path ?? WS_PATH,
      maxPayload: WS_MAX_PAYLOAD_BYTES,
    });
  }

  override bindClientDisconnect(client: WebSocket, callback: (...args: unknown[]) => void): void {
    client.on(WS_CLOSE_EVENT, callback);
  }

  bindMessageHandlers(
    client: WebSocket,
    handlers: WsMessageHandler[],
    transform: (data: unknown) => Observable<unknown>,
  ): void {
    client.on('message', (raw: RawData) => {
      const message = this.parseEnvelope(raw);
      if (!message) {
        return;
      }
      const handler = handlers.find((h) => h.message === message.event);
      if (!handler) {
        return;
      }
      transform(handler.callback(message.data)).subscribe({
        next: (response) => this.send(client, response),
        error: (err: unknown) => {
          this.send(client, {
            event: 'error',
            data: { message: err instanceof Error ? err.message : 'Unknown error' },
          });
        },
      });
    });
  }

  private parseEnvelope(raw: RawData): WsEnvelope | null {
    try {
      const parsed: unknown = JSON.parse(raw.toString());
      return isWsEnvelope(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  /** Sends `response` back to `client` as the same `{event, data}` envelope
   * inbound messages use — only when the handler actually returned a
   * `WsResponse`-shaped value (`undefined`/`void` means "no reply", the
   * common case for fire-and-forget events like `typing`). */
  private send(client: WebSocket, response: unknown): void {
    if (!isWsEnvelope(response) || client.readyState !== client.OPEN) {
      return;
    }
    client.send(JSON.stringify(response));
  }
}
