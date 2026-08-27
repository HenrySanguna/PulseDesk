import { JwtService } from '@nestjs/jwt';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '@pulsedesk/db';
import { WidgetService } from './widget.service.js';
import type { WidgetTokenPayload } from './widget-token.types.js';

const JWT_SECRET = 'test-widget-jwt-secret-not-for-production-use';

interface FakeConversation {
  id: string;
  customerId: string;
  createdAt: Date;
}

function makePrisma() {
  const customers = new Map<string, { id: string; sessionId: string }>();
  const conversationsByCustomer = new Map<string, FakeConversation[]>();
  let nextId = 1;

  const prisma = {
    customer: {
      upsert: vi.fn(({ where, create }: { where: { sessionId: string }; create: { sessionId: string } }) => {
        const existing = Array.from(customers.values()).find(
          (c) => c.sessionId === where.sessionId,
        );
        if (existing) return Promise.resolve(existing);
        const created = { id: `customer-${nextId++}`, sessionId: create.sessionId };
        customers.set(created.id, created);
        return Promise.resolve(created);
      }),
    },
    conversation: {
      findFirst: vi.fn(({ where }: { where: { customerId: string } }) => {
        const list = conversationsByCustomer.get(where.customerId) ?? [];
        const latest = [...list].sort(
          (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
        )[0];
        return Promise.resolve(latest ?? null);
      }),
      create: vi.fn(({ data }: { data: { customerId: string } }) => {
        const conversation: FakeConversation = {
          id: `conversation-${nextId++}`,
          customerId: data.customerId,
          createdAt: new Date(),
        };
        const list = conversationsByCustomer.get(data.customerId) ?? [];
        list.push(conversation);
        conversationsByCustomer.set(data.customerId, list);
        return Promise.resolve(conversation);
      }),
    },
  } as unknown as PrismaService;

  return prisma;
}

describe('WidgetService.createOrGetConversation', () => {
  it('creates a new customer and conversation for a first-time sessionId', async () => {
    const jwt = new JwtService({ secret: JWT_SECRET });
    const service = new WidgetService(makePrisma(), jwt);

    const result = await service.createOrGetConversation('widget-session-1');

    expect(result.conversationId).toBeTruthy();
    expect(result.customerId).toBeTruthy();
    const payload = await jwt.verifyAsync<WidgetTokenPayload>(result.token);
    expect(payload.conversationId).toBe(result.conversationId);
    expect(payload.customerId).toBe(result.customerId);
  });

  it('recovers the same customer and conversation for a returning sessionId', async () => {
    const jwt = new JwtService({ secret: JWT_SECRET });
    const prisma = makePrisma();
    const service = new WidgetService(prisma, jwt);

    const first = await service.createOrGetConversation('widget-session-2');
    const second = await service.createOrGetConversation('widget-session-2');

    expect(second.customerId).toBe(first.customerId);
    expect(second.conversationId).toBe(first.conversationId);
  });

  it('two different customerSessionIds never share a conversation', async () => {
    const jwt = new JwtService({ secret: JWT_SECRET });
    const prisma = makePrisma();
    const service = new WidgetService(prisma, jwt);

    const a = await service.createOrGetConversation('widget-session-a');
    const b = await service.createOrGetConversation('widget-session-b');

    expect(a.customerId).not.toBe(b.customerId);
    expect(a.conversationId).not.toBe(b.conversationId);
  });
});
