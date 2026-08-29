import type { IncomingMessage } from 'node:http';
import { Inject, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  type WsResponse,
} from '@nestjs/websockets';
import type { Message } from '@pulsedesk/db';
import { PrismaService } from '@pulsedesk/db';
import type { WebSocket } from 'ws';
import { SessionsService } from '../auth/sessions.service.js';
import { WS_PATH } from './native-ws.adapter.js';
import { ConversationRoomsService } from './conversation-rooms.service.js';
import { WidgetMessagingService } from './widget-messaging.service.js';
import { attachHeartbeat } from './ws-heartbeat.js';
import { authenticateWsHandshake, type WsAuthContext } from './ws-auth.js';

function toWireMessage(message: Message): Record<string, unknown> {
  return {
    id: message.id,
    ticketId: message.ticketId,
    authorAgentId: message.authorAgentId,
    visibility: message.visibility,
    body: message.body,
    clientMessageId: message.clientMessageId,
    createdAt: message.createdAt.toISOString(),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * The `ws` chat gateway (tasks.md section 2): rooms, heartbeat, handshake
 * auth, message send (widget side — see `widget-messaging.service.ts`'s
 * doc comment for why the agent side stays on the existing REST endpoint in
 * this batch), and typing/presence indicators (tasks.md 2.7).
 *
 * Every `@SubscribeMessage` handler runs for BOTH agent and widget sockets
 * — each one re-derives `authFor(client)` and enforces its own scoping
 * rule (a widget socket can only ever act on its OWN token's
 * `conversationId`; an agent socket must have explicitly `join`ed a
 * conversation before receiving anything for it), rather than trusting
 * whatever `conversationId` the message payload claims.
 *
 * Handshake auth is asynchronous (a widget JWT verify is fast, but an agent
 * session needs a real Valkey + Postgres round trip — see
 * `authenticateWsHandshake`), while `NativeWsAdapter.bindMessageHandlers`
 * attaches the client's `message` listener SYNCHRONOUSLY the instant the
 * `Upgrade` completes, independent of `handleConnection`'s own async body.
 * A fast client can send `join`/`message:send` before that Postgres lookup
 * resolves. Every handler therefore `await`s the SAME pending
 * `Promise<WsAuthContext | null>` stored in `authByClient` — created
 * synchronously as the very first line of `handleConnection`, before any
 * `await` — rather than reading a plain value that might not be set yet.
 */
@WebSocketGateway({ path: WS_PATH })
export class ConversationGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(ConversationGateway.name);
  private readonly authByClient = new WeakMap<WebSocket, Promise<WsAuthContext | null>>();
  private readonly detachHeartbeat = new WeakMap<WebSocket, () => void>();

  constructor(
    @Inject(SessionsService) private readonly sessions: SessionsService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(ConversationRoomsService) private readonly rooms: ConversationRoomsService,
    @Inject(WidgetMessagingService) private readonly widgetMessaging: WidgetMessagingService,
  ) {}

  handleConnection(client: WebSocket, request: IncomingMessage): void {
    // Synchronous — stored BEFORE any `await`, so it is already present in
    // `authByClient` by the time `NativeWsAdapter` finishes wiring this
    // client's message listener (see class doc comment).
    const authPromise = authenticateWsHandshake(request, {
      sessions: this.sessions,
      prisma: this.prisma,
      jwt: this.jwt,
    }).catch((err: unknown) => {
      this.logger.warn(`ws handshake auth failed: ${(err as Error).message}`);
      return null;
    });
    this.authByClient.set(client, authPromise);

    void authPromise.then((auth) => {
      if (!auth) {
        client.close(4001, 'Unauthorized');
        return;
      }
      this.detachHeartbeat.set(client, attachHeartbeat(client));
      // A widget token is scoped to exactly one conversation — it
      // auto-joins that room, there is no `join` message for widget
      // sockets to send (see `handleJoin`'s widget-scoping check for the
      // corresponding guard on the inbound side, spec "Aislamiento de
      // salas").
      if (auth.kind === 'widget') {
        this.rooms.join(auth.conversationId, client, auth);
      }
    });
  }

  handleDisconnect(client: WebSocket): void {
    this.detachHeartbeat.get(client)?.();
    this.detachHeartbeat.delete(client);
    const authPromise = this.authByClient.get(client);
    this.authByClient.delete(client);
    void authPromise?.then((auth) => {
      if (auth) {
        this.rooms.leaveAll(client, auth);
      }
    });
  }

  /** Agent-only: joins a conversation's room to receive its live messages,
   * typing indicators, and presence updates. A widget socket attempting to
   * join ANY conversation (including its own, redundantly) or a mismatched
   * one is rejected — proves spec's "Aislamiento de salas de conversación"
   * / tasks.md 5.5 (a widget token for conversation A can never end up a
   * member of conversation B's room). */
  @SubscribeMessage('join')
  async handleJoin(
    @MessageBody() data: unknown,
    @ConnectedSocket() client: WebSocket,
  ): Promise<WsResponse> {
    const auth = await this.authByClient.get(client);
    const conversationId = isRecord(data) ? data['conversationId'] : undefined;
    if (!auth || typeof conversationId !== 'string') {
      return { event: 'error', data: { message: 'INVALID_JOIN_REQUEST' } };
    }
    if (auth.kind === 'widget') {
      return { event: 'error', data: { message: 'WIDGET_CANNOT_JOIN_ROOMS' } };
    }
    this.rooms.join(conversationId, client, auth);
    return {
      event: 'joined',
      data: { conversationId, agentIds: this.rooms.presentAgentIds(conversationId) },
    };
  }

  @SubscribeMessage('leave')
  async handleLeave(@MessageBody() data: unknown, @ConnectedSocket() client: WebSocket): Promise<void> {
    const auth = await this.authByClient.get(client);
    const conversationId = isRecord(data) ? data['conversationId'] : undefined;
    if (!auth || typeof conversationId !== 'string' || auth.kind !== 'agent') {
      return;
    }
    this.rooms.leave(conversationId, client, auth);
  }

  /** Widget-authored messages only (see class doc comment). Persists via
   * `WidgetMessagingService.sendMessage` (idempotent on `clientMessageId`,
   * spec "Idempotencia de mensajes reenviados por reconexión") and
   * broadcasts the result to every OTHER member of the room (agents who
   * `join`ed this ticket's conversation) — this is what makes a widget
   * message "aparece en la consola sin recargar" (Definición de
   * terminado). */
  @SubscribeMessage('message:send')
  async handleMessageSend(
    @MessageBody() data: unknown,
    @ConnectedSocket() client: WebSocket,
  ): Promise<WsResponse> {
    const auth = await this.authByClient.get(client);
    if (!auth || auth.kind !== 'widget') {
      return { event: 'error', data: { message: 'ONLY_WIDGET_CAN_SEND_HERE' } };
    }
    const body = isRecord(data) ? data['body'] : undefined;
    const clientMessageId = isRecord(data) ? data['clientMessageId'] : undefined;
    if (typeof body !== 'string' || body.trim().length === 0 || typeof clientMessageId !== 'string') {
      return { event: 'error', data: { message: 'INVALID_MESSAGE' } };
    }

    try {
      const message = await this.widgetMessaging.sendMessage(auth.conversationId, auth.customerId, {
        body,
        clientMessageId,
      });
      this.rooms.broadcast(
        auth.conversationId,
        { event: 'message:new', data: toWireMessage(message) },
        client,
      );
      return { event: 'message:ack', data: toWireMessage(message) };
    } catch (err) {
      this.logger.warn(`message:send failed: ${(err as Error).message}`);
      return { event: 'error', data: { message: 'MESSAGE_SEND_FAILED' } };
    }
  }

  /** Fire-and-forget typing indicator (tasks.md 2.7) — broadcast to the
   * rest of the room, no persistence, no ack. */
  @SubscribeMessage('typing')
  async handleTyping(@MessageBody() data: unknown, @ConnectedSocket() client: WebSocket): Promise<void> {
    const auth = await this.authByClient.get(client);
    const conversationId =
      auth?.kind === 'widget' ? auth.conversationId : isRecord(data) ? data['conversationId'] : undefined;
    if (!auth || typeof conversationId !== 'string' || !this.rooms.isMember(conversationId, client)) {
      return;
    }
    this.rooms.broadcast(
      conversationId,
      {
        event: 'typing',
        data: {
          conversationId,
          from: auth.kind === 'agent' ? { kind: 'agent', agentId: auth.agentId } : { kind: 'widget' },
        },
      },
      client,
    );
  }
}
