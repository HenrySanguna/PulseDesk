import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { JwtService } from '@nestjs/jwt';
import { WebSocket } from 'ws';
import { createValkeyClient, PrismaService } from '@pulsedesk/db';
import { seedTestAgent } from '../auth/test-fakes.js';
import { SessionsService } from '../auth/sessions.service.js';
import type { AssignmentQueuePort } from '../sla/assignment-queue.service.js';
import type { SlaClockPort } from '../sla/sla-clock.service.js';
import { TicketsService } from '../tickets/tickets.service.js';
import { WidgetService } from '../widget/widget.service.js';
import { WIDGET_TOKEN_TTL } from '../widget/widget.constants.js';
import { NativeWsAdapter } from './native-ws.adapter.js';
import { ConversationGateway } from './conversation.gateway.js';
import { ConversationRoomsService } from './conversation-rooms.service.js';
import { WidgetMessagingService } from './widget-messaging.service.js';

interface WireEnvelope {
  event: string;
  data: Record<string, unknown>;
}

/** No-op fakes — this test proves the `ws` gateway's own auth/rooms/message
 * wiring, not auto-assignment or SLA clock behavior (those have their own
 * dedicated integration tests). Same pattern as
 * `apps/api/src/tickets/tickets.integration.spec.ts`. */
function makeAssignmentQueue(): AssignmentQueuePort {
  return { enqueueAutoAssign: async () => undefined };
}
function makeSlaClocks(): SlaClockPort {
  return {
    start: async () => undefined as never,
    pause: async () => [],
    resume: async () => [],
    complete: async () => null,
    reactivate: async () => undefined as never,
  };
}

/**
 * Real running Nest app (a minimal, self-contained module — NOT
 * `RealtimeModule`/`AppModule`) + a real `ws` client connecting over an
 * actual `Upgrade` handshake against `app.listen()`. Every dependency
 * `ConversationGateway` actually needs is provided explicitly (some as
 * manually-constructed real instances, matching this repo's established
 * "construct services with `new`, no Nest DI" integration-test convention —
 * see `tickets.integration.spec.ts`/`sla-clock.service.integration.spec.ts`
 * — since Nest's gateway auto-discovery specifically requires the gateway
 * class itself to be a plain provider, unlike every other service here).
 * Auth uses real Valkey sessions / real widget JWTs; only auto-assignment
 * and SLA clocks are faked (irrelevant to this layer).
 */
describe('ConversationGateway (real Nest app + real ws client)', () => {
  let app: NestFastifyApplication;
  let baseWsUrl: string;

  const prisma = new PrismaService();
  const valkey = createValkeyClient(process.env['REDIS_URL'] as string);
  const sessions = new SessionsService(valkey);
  const jwt = new JwtService({
    secret: process.env['WIDGET_JWT_SECRET'],
    signOptions: { expiresIn: WIDGET_TOKEN_TTL },
  });
  const widgetService = new WidgetService(prisma, jwt);
  const ticketsService = new TicketsService(prisma, makeAssignmentQueue(), makeSlaClocks());

  const suffix = `ws-gw-${Date.now()}`;
  const agentId = randomUUID();
  const secondAgentId = randomUUID();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        { provide: PrismaService, useValue: prisma },
        { provide: SessionsService, useValue: sessions },
        { provide: JwtService, useValue: jwt },
        { provide: TicketsService, useValue: ticketsService },
        ConversationRoomsService,
        WidgetMessagingService,
        ConversationGateway,
      ],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.useWebSocketAdapter(new NativeWsAdapter(app));
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address() as AddressInfo;
    baseWsUrl = `ws://127.0.0.1:${address.port}/ws`;

    await seedTestAgent(prisma, { id: agentId, email: `${suffix}@example.com` });
    await seedTestAgent(prisma, { id: secondAgentId, email: `${suffix}-2@example.com` });
  });

  afterAll(async () => {
    await app.close();
    await prisma.message.deleteMany({ where: { ticket: { customer: { sessionId: { contains: suffix } } } } });
    await prisma.ticketEvent.deleteMany({ where: { ticket: { customer: { sessionId: { contains: suffix } } } } });
    await prisma.conversation.deleteMany({ where: { customer: { sessionId: { contains: suffix } } } });
    await prisma.ticket.deleteMany({ where: { customer: { sessionId: { contains: suffix } } } });
    await prisma.customer.deleteMany({ where: { sessionId: { contains: suffix } } });
    await prisma.agent.deleteMany({ where: { id: { in: [agentId, secondAgentId] } } });
    await prisma.$disconnect();
    await valkey.quit();
  });

  async function agentCookie(forAgentId: string = agentId): Promise<string> {
    const token = await sessions.createSession(forAgentId);
    return `pd_session=${token}`;
  }

  /** Bypasses HTTP entirely for test SETUP (widget conversation creation
   * isn't what's under test here) — calls the real `WidgetService` the
   * same way `POST /widget/conversations` does, matching this test's
   * agent-auth setup (`SessionsService.createSession` directly, not a
   * real `POST /auth/login` round trip). */
  async function createWidgetConversation(): Promise<{ conversationId: string; token: string }> {
    const result = await widgetService.createOrGetConversation(`${suffix}-${randomUUID()}`);
    return { conversationId: result.conversationId, token: result.token };
  }

  function connect(query = '', extraHeaders: Record<string, string> = {}): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(`${baseWsUrl}${query}`, { headers: extraHeaders });
      socket.once('open', () => resolve(socket));
      socket.once('error', reject);
    });
  }

  function waitForEnvelope(
    socket: WebSocket,
    predicate: (msg: WireEnvelope) => boolean,
    timeoutMs = 4000,
  ): Promise<WireEnvelope> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.off('message', onMessage);
        reject(new Error('waitForEnvelope timed out'));
      }, timeoutMs);
      const onMessage = (raw: Buffer): void => {
        const msg = JSON.parse(raw.toString()) as WireEnvelope;
        if (predicate(msg)) {
          clearTimeout(timer);
          socket.off('message', onMessage);
          resolve(msg);
        }
      };
      socket.on('message', onMessage);
    });
  }

  it('5.4: resending the same clientMessageId after a reconnect does not create a duplicate message', async () => {
    const conversation = await createWidgetConversation();
    const clientMessageId = randomUUID();

    const first = await connect(`?token=${conversation.token}`);
    first.send(
      JSON.stringify({ event: 'message:send', data: { body: 'first send', clientMessageId } }),
    );
    const ack1 = await waitForEnvelope(first, (m) => m.event === 'message:ack');
    first.close();

    // Reconnect (simulating the client not knowing whether the first send's
    // ack actually arrived) and resend the EXACT same clientMessageId.
    const second = await connect(`?token=${conversation.token}`);
    second.send(
      JSON.stringify({ event: 'message:send', data: { body: 'first send', clientMessageId } }),
    );
    const ack2 = await waitForEnvelope(second, (m) => m.event === 'message:ack');
    second.close();

    expect(ack2.data['id']).toBe(ack1.data['id']);

    const persistedConversation = await prisma.conversation.findUniqueOrThrow({
      where: { id: conversation.conversationId },
    });
    const messages = await prisma.message.findMany({
      where: { ticketId: persistedConversation.ticketId as string, clientMessageId },
    });
    expect(messages).toHaveLength(1);
  }, 10_000);

  it("5.5: a widget token for conversation A cannot join or leak into conversation B's ws room", async () => {
    const convA = await createWidgetConversation();
    const convB = await createWidgetConversation();

    const socketA = await connect(`?token=${convA.token}`);
    const socketAgent = await connect('', { cookie: await agentCookie() });

    socketAgent.send(JSON.stringify({ event: 'join', data: { conversationId: convB.conversationId } }));
    await waitForEnvelope(socketAgent, (m) => m.event === 'joined');

    let leaked = false;
    socketAgent.on('message', (raw) => {
      const msg = JSON.parse(raw.toString()) as WireEnvelope;
      if (msg.event === 'message:new') {
        leaked = true;
      }
    });

    // Widget A sends a message in ITS OWN conversation — the agent joined a
    // DIFFERENT room (B) and must never receive it.
    socketA.send(
      JSON.stringify({
        event: 'message:send',
        data: { body: 'hello from A', clientMessageId: randomUUID() },
      }),
    );
    await waitForEnvelope(socketA, (m) => m.event === 'message:ack');
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(leaked).toBe(false);

    // Widget A itself is structurally forbidden from ever joining another
    // conversation's room, including B's.
    socketA.send(JSON.stringify({ event: 'join', data: { conversationId: convB.conversationId } }));
    const rejection = await waitForEnvelope(socketA, (m) => m.event === 'error');
    expect(rejection.data['message']).toBe('WIDGET_CANNOT_JOIN_ROOMS');

    socketA.close();
    socketAgent.close();
  }, 10_000);

  it('an unauthenticated ws connection (no cookie, no token) is closed by the server', async () => {
    const socket = new WebSocket(baseWsUrl);
    const closeCode = await new Promise<number>((resolve, reject) => {
      socket.once('close', (code) => resolve(code));
      socket.once('error', reject);
    });
    expect(closeCode).toBe(4001);
  }, 5000);

  it('a message broadcast in one conversation only reaches agents who joined that exact room (isolation, spec scenario)', async () => {
    const convA = await createWidgetConversation();
    const convB = await createWidgetConversation();

    const socketA = await connect(`?token=${convA.token}`);
    const agentOnA = await connect('', { cookie: await agentCookie() });
    const agentOnB = await connect('', { cookie: await agentCookie() });

    agentOnA.send(JSON.stringify({ event: 'join', data: { conversationId: convA.conversationId } }));
    await waitForEnvelope(agentOnA, (m) => m.event === 'joined');
    agentOnB.send(JSON.stringify({ event: 'join', data: { conversationId: convB.conversationId } }));
    await waitForEnvelope(agentOnB, (m) => m.event === 'joined');

    let bReceived = false;
    agentOnB.on('message', (raw) => {
      const msg = JSON.parse(raw.toString()) as WireEnvelope;
      if (msg.event === 'message:new') {
        bReceived = true;
      }
    });

    socketA.send(
      JSON.stringify({
        event: 'message:send',
        data: { body: 'isolated message', clientMessageId: randomUUID() },
      }),
    );

    const received = await waitForEnvelope(agentOnA, (m) => m.event === 'message:new');
    expect(received.data['body']).toBe('isolated message');

    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(bReceived).toBe(false);

    socketA.close();
    agentOnA.close();
    agentOnB.close();
  }, 10_000);

  it('a joined agent sees a real-time presence update when a second agent joins the same room', async () => {
    const conv = await createWidgetConversation();
    const socket = await connect(`?token=${conv.token}`);

    const agent1 = await connect('', { cookie: await agentCookie() });
    agent1.send(JSON.stringify({ event: 'join', data: { conversationId: conv.conversationId } }));
    await waitForEnvelope(agent1, (m) => m.event === 'joined');

    const presencePromise = waitForEnvelope(agent1, (m) => m.event === 'presence:update');
    const agent2 = await connect('', { cookie: await agentCookie(secondAgentId) });
    agent2.send(JSON.stringify({ event: 'join', data: { conversationId: conv.conversationId } }));

    const presence = await presencePromise;
    expect(presence.data['agentIds']).toEqual(
      expect.arrayContaining([agentId, secondAgentId]),
    );
    expect((presence.data['agentIds'] as string[]).length).toBe(2);

    socket.close();
    agent1.close();
    agent2.close();
  }, 10_000);

  it('typing indicators are broadcast to the room but not echoed back to the sender', async () => {
    const conv = await createWidgetConversation();
    const socket = await connect(`?token=${conv.token}`);
    const agent = await connect('', { cookie: await agentCookie() });
    agent.send(JSON.stringify({ event: 'join', data: { conversationId: conv.conversationId } }));
    await waitForEnvelope(agent, (m) => m.event === 'joined');

    let echoedToSender = false;
    socket.on('message', (raw) => {
      const msg = JSON.parse(raw.toString()) as WireEnvelope;
      if (msg.event === 'typing') {
        echoedToSender = true;
      }
    });

    socket.send(JSON.stringify({ event: 'typing', data: {} }));

    const received = await waitForEnvelope(agent, (m) => m.event === 'typing');
    expect(received.data['conversationId']).toBe(conv.conversationId);

    // Give any (incorrect) echo back to the sender time to arrive before
    // asserting its absence.
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(echoedToSender).toBe(false);

    socket.close();
    agent.close();
  }, 10_000);
});
