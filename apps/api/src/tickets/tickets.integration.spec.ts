import 'dotenv/config';
import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  MessageVisibility,
  PrismaService,
  TicketPriority,
  TicketStatus,
} from '@pulsedesk/db';
import { seedTestAgent } from '../auth/test-fakes.js';
import type { AssignmentQueuePort } from '../sla/assignment-queue.service.js';
import { TicketsService } from './tickets.service.js';

/** Ticket-domain integration tests don't exercise auto-assignment (that's
 * `apps/api/src/sla/assignment.consumer.integration.spec.ts`'s job) — a
 * no-op fake keeps `createTicket` from touching real BullMQ/Valkey here. */
function makeAssignmentQueue(): AssignmentQueuePort {
  return { enqueueAutoAssign: async () => undefined };
}

/**
 * Real-Postgres integration tests for the ticket domain — tasks.md 5.1
 * through 5.4. Every scenario here exercises the real atomic `updateMany`,
 * the real Prisma `WHERE`-clause message filter, and the real enum
 * declaration order — none of which a mocked Prisma client would prove.
 * Runs against the docker-compose Postgres via `DATABASE_URL` (or CI's
 * service container); see `PrismaService`.
 */
describe('TicketsService (real Postgres)', () => {
  const prisma = new PrismaService();
  const service = new TicketsService(prisma, makeAssignmentQueue());
  const suffix = `tix-${Date.now()}`;
  const customerId = crypto.randomUUID();
  const agentAId = crypto.randomUUID();
  const agentBId = crypto.randomUUID();
  const ticketIds: string[] = [];

  async function seedTicket(priority: TicketPriority = TicketPriority.NORMAL) {
    const ticket = await prisma.ticket.create({
      data: { subject: `Ticket ${suffix}`, customerId, priority },
    });
    ticketIds.push(ticket.id);
    return ticket;
  }

  beforeAll(async () => {
    await prisma.customer.create({
      data: { id: customerId, sessionId: `session-${suffix}` },
    });
    await seedTestAgent(prisma, {
      id: agentAId,
      email: `agent-a-${suffix}@pulsedesk.test`,
    });
    await seedTestAgent(prisma, {
      id: agentBId,
      email: `agent-b-${suffix}@pulsedesk.test`,
    });
  });

  afterAll(async () => {
    await prisma.message.deleteMany({ where: { ticketId: { in: ticketIds } } });
    await prisma.ticketEvent.deleteMany({
      where: { ticketId: { in: ticketIds } },
    });
    await prisma.ticket.deleteMany({ where: { id: { in: ticketIds } } });
    await prisma.agent.deleteMany({ where: { id: { in: [agentAId, agentBId] } } });
    await prisma.customer.deleteMany({ where: { id: customerId } });
    await prisma.$disconnect();
  });

  it('5.1: exactly one of two agents claiming the same ticket concurrently wins', async () => {
    const ticket = await seedTicket();

    const results = await Promise.allSettled([
      service.claimTicket(ticket.id, agentAId),
      service.claimTicket(ticket.id, agentBId),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      ConflictException,
    );

    const winner = fulfilled[0] as PromiseFulfilledResult<
      Awaited<ReturnType<typeof service.claimTicket>>
    >;
    expect([agentAId, agentBId]).toContain(winner.value.assigneeId);

    const persisted = await prisma.ticket.findUniqueOrThrow({
      where: { id: ticket.id },
    });
    expect(persisted.assigneeId).toBe(winner.value.assigneeId);
    expect(persisted.status).toBe(TicketStatus.OPEN);
  });

  it('reclaiming an already-assigned ticket is rejected without touching the existing assignment', async () => {
    const ticket = await seedTicket();
    const claimed = await service.claimTicket(ticket.id, agentAId);

    await expect(
      service.claimTicket(ticket.id, agentBId),
    ).rejects.toBeInstanceOf(ConflictException);

    const persisted = await prisma.ticket.findUniqueOrThrow({
      where: { id: ticket.id },
    });
    expect(persisted.assigneeId).toBe(claimed.assigneeId);
  });

  it('5.2: new -> closed is rejected and leaves the ticket status unchanged', async () => {
    const ticket = await seedTicket();
    expect(ticket.status).toBe(TicketStatus.NEW);

    await expect(
      service.updateStatus(ticket.id, TicketStatus.CLOSED, agentAId),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    const persisted = await prisma.ticket.findUniqueOrThrow({
      where: { id: ticket.id },
    });
    expect(persisted.status).toBe(TicketStatus.NEW);
  });

  it('5.3: internal notes never reach the response served to the ticket-owning customer', async () => {
    const ticket = await seedTicket();
    await service.addMessage(
      ticket.id,
      { body: 'public reply', visibility: MessageVisibility.PUBLIC },
      agentAId,
    );
    await service.addMessage(
      ticket.id,
      { body: 'internal note', visibility: MessageVisibility.INTERNAL },
      agentAId,
    );

    const customerView = await service.getTicketForCustomer(
      ticket.id,
      customerId,
    );
    expect(customerView.messages).toHaveLength(1);
    expect(
      customerView.messages.every(
        (message) => message.visibility === MessageVisibility.PUBLIC,
      ),
    ).toBe(true);

    const agentView = await service.getTicketForAgent(ticket.id);
    expect(agentView.messages).toHaveLength(2);
    expect(
      agentView.messages.some(
        (message) => message.visibility === MessageVisibility.INTERNAL,
      ),
    ).toBe(true);
  });

  it('5.4: TicketPriority preserves declaration order and the queue prioritizes urgent > normal > low', async () => {
    // Canary: this is the exact check that would catch someone silently
    // reordering the TicketPriority enum in ticket.prisma (design.md
    // "Riesgo: orden de un enum en Prisma") — without this, only the
    // behavioral assertion below would flag the regression.
    expect(Object.values(TicketPriority)).toEqual([
      'LOW',
      'NORMAL',
      'HIGH',
      'URGENT',
    ]);

    // Created in this order per the spec scenario — the queue must NOT
    // return them in creation order.
    const normal = await seedTicket(TicketPriority.NORMAL);
    const urgent = await seedTicket(TicketPriority.URGENT);
    const low = await seedTicket(TicketPriority.LOW);

    const { items } = await service.listTickets({ pageSize: 1000 });
    const relevantIds = items
      .map((item) => item.id)
      .filter((id) => [normal.id, urgent.id, low.id].includes(id));

    expect(relevantIds).toEqual([urgent.id, normal.id, low.id]);
  });
});
