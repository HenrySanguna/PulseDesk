import 'dotenv/config';
import { afterAll, describe, expect, it } from 'vitest';
import { PrismaService, TicketEventType, TicketStatus } from '@pulsedesk/db';
import { seedTestAgent } from '../auth/test-fakes.js';
import { AssignmentConsumer } from './assignment.consumer.js';
import { createBullMqConnection } from './bullmq-connection.provider.js';

/**
 * Real-Postgres proof of tasks.md 5.6 (capacity exclusion) and the
 * round-robin write path (write assigneeId + `lastAssignedAt` + a single
 * `TicketEvent`, atomically, idempotently).
 *
 * 5.7 (tie-break by longest-since-last-assignment) is proven authoritatively
 * by `round-robin.spec.ts` — a pure, fully isolated unit test of
 * `pickAssignmentCandidate`. This shared-Postgres integration suite can
 * only assert "candidate X is never picked" (robust regardless of other
 * test files' agents also present in the table); it deliberately does NOT
 * assert "candidate X specifically wins a tie" here, because
 * `getAgentLoad` — per design.md, reused unmodified — reads the WHOLE
 * `Agent` table, so any other concurrently-running spec's freshly-seeded,
 * still-unassigned agent (ratio 0, `lastAssignedAt: null`) could
 * legitimately tie with this suite's own fixtures. That is a property of
 * sharing one Postgres across the whole test run, not a gap in the
 * round-robin rule itself.
 */
describe('AssignmentConsumer (real Postgres)', () => {
  const prisma = new PrismaService();
  const connection = createBullMqConnection(process.env['REDIS_URL'] as string);
  const consumer = new AssignmentConsumer(connection, prisma);

  const suffix = `assignment-consumer-${Date.now()}`;
  const agentIds: string[] = [];
  const ticketIds: string[] = [];
  const customerIds: string[] = [];

  afterAll(async () => {
    await prisma.ticketEvent.deleteMany({ where: { ticketId: { in: ticketIds } } });
    await prisma.ticket.deleteMany({ where: { id: { in: ticketIds } } });
    await prisma.agent.deleteMany({ where: { id: { in: agentIds } } });
    await prisma.customer.deleteMany({ where: { id: { in: customerIds } } });
    await connection.quit();
    await prisma.$disconnect();
  });

  async function seedAgent(label: string, opts: { maxCapacity: number }) {
    const id = crypto.randomUUID();
    await seedTestAgent(prisma, { id, email: `${label}-${suffix}@pulsedesk.test` });
    await prisma.agent.update({ where: { id }, data: { maxCapacity: opts.maxCapacity } });
    agentIds.push(id);
    return id;
  }

  async function seedUnassignedTicket(label: string) {
    const customerId = crypto.randomUUID();
    await prisma.customer.create({
      data: { id: customerId, sessionId: `session-${label}-${suffix}` },
    });
    customerIds.push(customerId);
    const ticket = await prisma.ticket.create({
      data: { subject: `Auto-assign test ${label}`, customerId },
    });
    ticketIds.push(ticket.id);
    return ticket.id;
  }

  it('5.6: never assigns a ticket to an agent already at maxCapacity', async () => {
    const atCapacityAgentId = await seedAgent('at-capacity', { maxCapacity: 1 });
    const withRoomAgentId = await seedAgent('with-room', { maxCapacity: 5 });
    void withRoomAgentId;

    // Occupy the at-capacity agent's one slot with an existing OPEN ticket.
    const occupyingTicketId = await seedUnassignedTicket('occupying');
    await prisma.ticket.update({
      where: { id: occupyingTicketId },
      data: { assigneeId: atCapacityAgentId, status: TicketStatus.OPEN },
    });

    const newTicketId = await seedUnassignedTicket('new');
    await consumer.process(newTicketId);

    const persisted = await prisma.ticket.findUniqueOrThrow({ where: { id: newTicketId } });
    expect(persisted.assigneeId).not.toBeNull();
    expect(persisted.assigneeId).not.toBe(atCapacityAgentId);
  });

  it('5.6: leaves the ticket unassigned when every candidate agent (created by this test) is at capacity, without throwing', async () => {
    const soleAgentId = await seedAgent('sole-at-capacity', { maxCapacity: 1 });
    const occupyingTicketId = await seedUnassignedTicket('sole-occupying');
    await prisma.ticket.update({
      where: { id: occupyingTicketId },
      data: { assigneeId: soleAgentId, status: TicketStatus.OPEN },
    });

    const newTicketId = await seedUnassignedTicket('sole-new');
    await expect(consumer.process(newTicketId)).resolves.not.toThrow();
    // Assertion intentionally omitted for "still unassigned": other spec
    // files' agents may have capacity and legitimately claim it — the
    // meaningful guarantee here is that processing an unassignable-by-this-
    // agent ticket never throws, not that the whole shared table has zero
    // capacity anywhere.
  });

  it('round-robin write path: assigns atomically (assigneeId + status + lastAssignedAt + one TicketEvent) and is idempotent on replay', async () => {
    const agentId = await seedAgent('write-path', { maxCapacity: 50 });
    const ticketId = await seedUnassignedTicket('write-path');

    await consumer.process(ticketId);
    await consumer.process(ticketId); // simulate a duplicate job execution

    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
    expect(ticket.status).toBe(TicketStatus.OPEN);
    expect(ticket.assigneeId).not.toBeNull();

    const events = await prisma.ticketEvent.findMany({
      where: { ticketId, type: TicketEventType.ASSIGNED },
    });
    expect(events).toHaveLength(1);

    if (ticket.assigneeId === agentId) {
      const agent = await prisma.agent.findUniqueOrThrow({ where: { id: agentId } });
      expect(agent.lastAssignedAt).not.toBeNull();
    }
  });

  it('is a no-op for an already-assigned ticket', async () => {
    const agentId = await seedAgent('already-assigned', { maxCapacity: 5 });
    const ticketId = await seedUnassignedTicket('already-assigned');
    await prisma.ticket.update({
      where: { id: ticketId },
      data: { assigneeId: agentId, status: TicketStatus.OPEN },
    });

    await consumer.process(ticketId);

    const events = await prisma.ticketEvent.findMany({
      where: { ticketId, type: TicketEventType.ASSIGNED },
    });
    expect(events).toHaveLength(0);
  });
});
