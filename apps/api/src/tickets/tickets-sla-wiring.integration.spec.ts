import 'dotenv/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addBusinessMinutes } from '@pulsedesk/sla-engine';
import {
  MessageVisibility,
  PrismaService,
  SlaClockKind,
  TicketPriority,
  TicketStatus,
} from '@pulsedesk/db';
import { seedTestAgent } from '../auth/test-fakes.js';
import type { AssignmentQueuePort } from '../sla/assignment-queue.service.js';
import { createBullMqConnection } from '../sla/bullmq-connection.provider.js';
import { BusinessCalendarRepository } from '../sla/business-calendar.repository.js';
import { SlaClockRepository } from '../sla/sla-clock.repository.js';
import { SlaClockService } from '../sla/sla-clock.service.js';
import { SlaQueueService } from '../sla/sla-queue.service.js';
import { ALWAYS_OPEN_CALENDAR, ensureAlwaysOpenCalendar } from '../sla/sla-test-fixtures.js';
import { TicketsService } from './tickets.service.js';

/** `tickets.integration.spec.ts` fakes out SLA entirely — this file proves
 * the actual end-to-end wiring `TicketsService` now has to SLA clocks:
 * policy-by-priority lookup on creation, pause/resume on PENDING, complete
 * on first public reply / resolution, and reactivate on reopen
 * (openspec/changes/04-add-sla-jobs "Definición de terminado", the item
 * left open by the first apply batch). Uses a REAL `SlaClockService`
 * (real Postgres + real Valkey/BullMQ), not a fake. */
function makeAssignmentQueue(): AssignmentQueuePort {
  return { enqueueAutoAssign: async () => undefined };
}

describe('TicketsService SLA wiring (real Postgres + real Valkey)', () => {
  const prisma = new PrismaService();
  const connection = createBullMqConnection(process.env['REDIS_URL'] as string);
  const repo = new SlaClockRepository(prisma);
  const calendars = new BusinessCalendarRepository(prisma);
  const slaQueue = new SlaQueueService(connection);
  const slaClocks = new SlaClockService(repo, calendars, slaQueue, prisma);
  const service = new TicketsService(prisma, makeAssignmentQueue(), slaClocks);

  const suffix = `tix-sla-${Date.now()}`;
  const customerId = crypto.randomUUID();
  const agentId = crypto.randomUUID();
  const ticketIds: string[] = [];

  beforeAll(async () => {
    await ensureAlwaysOpenCalendar(prisma);
    await prisma.customer.create({
      data: { id: customerId, sessionId: `session-${suffix}` },
    });
    await seedTestAgent(prisma, { id: agentId, email: `agent-${suffix}@pulsedesk.test` });
  });

  afterAll(async () => {
    await prisma.message.deleteMany({ where: { ticketId: { in: ticketIds } } });
    await prisma.ticketEvent.deleteMany({ where: { ticketId: { in: ticketIds } } });
    await prisma.slaClock.deleteMany({ where: { ticketId: { in: ticketIds } } });
    await prisma.ticket.deleteMany({ where: { id: { in: ticketIds } } });
    await prisma.agent.deleteMany({ where: { id: agentId } });
    await prisma.customer.deleteMany({ where: { id: customerId } });
    await slaQueue.onModuleDestroy();
    await connection.quit();
    await prisma.$disconnect();
  });

  async function createTicket(priority: TicketPriority) {
    const ticket = await service.createTicket({
      customerId,
      subject: `SLA wiring ${suffix}`,
      priority,
    });
    ticketIds.push(ticket.id);
    return ticket;
  }

  it('createTicket seeds both clocks from the URGENT policy (15/60 minutes)', async () => {
    const ticket = await createTicket(TicketPriority.URGENT);
    expect(ticket.slaPolicyId).not.toBeNull();

    const firstResponse = await slaClocks.findByTicketAndKind(
      ticket.id,
      SlaClockKind.FIRST_RESPONSE,
    );
    const resolution = await slaClocks.findByTicketAndKind(
      ticket.id,
      SlaClockKind.RESOLUTION,
    );
    expect(firstResponse.targetMinutes).toBe(15);
    expect(resolution.targetMinutes).toBe(60);
    expect(firstResponse.dueAt).not.toBeNull();
    expect(resolution.dueAt).not.toBeNull();
  });

  it('createTicket seeds both clocks from the LOW policy (120/1440 minutes) — a different priority maps to a different policy', async () => {
    const ticket = await createTicket(TicketPriority.LOW);

    const firstResponse = await slaClocks.findByTicketAndKind(
      ticket.id,
      SlaClockKind.FIRST_RESPONSE,
    );
    const resolution = await slaClocks.findByTicketAndKind(
      ticket.id,
      SlaClockKind.RESOLUTION,
    );
    expect(firstResponse.targetMinutes).toBe(120);
    expect(resolution.targetMinutes).toBe(1440);
  });

  it('OPEN -> PENDING -> OPEN pauses then resumes both ticket clocks', async () => {
    const ticket = await createTicket(TicketPriority.NORMAL);
    await service.claimTicket(ticket.id, agentId); // NEW -> OPEN

    await service.updateStatus(ticket.id, TicketStatus.PENDING, agentId);
    const pausedFirstResponse = await slaClocks.findByTicketAndKind(
      ticket.id,
      SlaClockKind.FIRST_RESPONSE,
    );
    const pausedResolution = await slaClocks.findByTicketAndKind(
      ticket.id,
      SlaClockKind.RESOLUTION,
    );
    expect(pausedFirstResponse.pausedAt).not.toBeNull();
    expect(pausedResolution.pausedAt).not.toBeNull();
    expect(pausedFirstResponse.dueAt).toBeNull();
    expect(pausedResolution.dueAt).toBeNull();

    await service.updateStatus(ticket.id, TicketStatus.OPEN, agentId);
    const resumedFirstResponse = await slaClocks.findByTicketAndKind(
      ticket.id,
      SlaClockKind.FIRST_RESPONSE,
    );
    const resumedResolution = await slaClocks.findByTicketAndKind(
      ticket.id,
      SlaClockKind.RESOLUTION,
    );
    expect(resumedFirstResponse.pausedAt).toBeNull();
    expect(resumedResolution.pausedAt).toBeNull();
    expect(resumedFirstResponse.dueAt).not.toBeNull();
    expect(resumedResolution.dueAt).not.toBeNull();
  });

  it("an agent's first PUBLIC message completes FIRST_RESPONSE idempotently (two messages, one completion effect)", async () => {
    const ticket = await createTicket(TicketPriority.NORMAL);
    await service.claimTicket(ticket.id, agentId);

    await service.addMessage(
      ticket.id,
      { body: 'first public reply', visibility: MessageVisibility.PUBLIC },
      agentId,
    );
    const afterFirst = await slaClocks.findByTicketAndKind(
      ticket.id,
      SlaClockKind.FIRST_RESPONSE,
    );
    expect(afterFirst.completedAt).not.toBeNull();

    await service.addMessage(
      ticket.id,
      { body: 'second public reply', visibility: MessageVisibility.PUBLIC },
      agentId,
    );
    const afterSecond = await slaClocks.findByTicketAndKind(
      ticket.id,
      SlaClockKind.FIRST_RESPONSE,
    );
    expect(afterSecond.completedAt).toEqual(afterFirst.completedAt);

    // RESOLUTION is untouched by message-posting.
    const resolution = await slaClocks.findByTicketAndKind(ticket.id, SlaClockKind.RESOLUTION);
    expect(resolution.completedAt).toBeNull();
  });

  it('an INTERNAL-only message does not complete FIRST_RESPONSE', async () => {
    const ticket = await createTicket(TicketPriority.NORMAL);
    await service.claimTicket(ticket.id, agentId);

    await service.addMessage(
      ticket.id,
      { body: 'internal note', visibility: MessageVisibility.INTERNAL },
      agentId,
    );
    const firstResponse = await slaClocks.findByTicketAndKind(
      ticket.id,
      SlaClockKind.FIRST_RESPONSE,
    );
    expect(firstResponse.completedAt).toBeNull();
  });

  it('-> RESOLVED completes the RESOLUTION clock', async () => {
    const ticket = await createTicket(TicketPriority.NORMAL);
    await service.claimTicket(ticket.id, agentId);

    await service.updateStatus(ticket.id, TicketStatus.RESOLVED, agentId);
    const resolution = await slaClocks.findByTicketAndKind(ticket.id, SlaClockKind.RESOLUTION);
    expect(resolution.completedAt).not.toBeNull();
    expect(resolution.dueAt).toBeNull();
  });

  it('reopening a resolved ticket reactivates the SAME RESOLUTION clock row with correctly recomputed remaining time', async () => {
    const ticket = await createTicket(TicketPriority.NORMAL); // resolutionMinutes = 480
    await service.claimTicket(ticket.id, agentId);
    await service.addMessage(
      ticket.id,
      { body: 'public reply before resolving', visibility: MessageVisibility.PUBLIC },
      agentId,
    );
    const firstResponseBeforeResolve = await slaClocks.findByTicketAndKind(
      ticket.id,
      SlaClockKind.FIRST_RESPONSE,
    );

    const before = await slaClocks.findByTicketAndKind(ticket.id, SlaClockKind.RESOLUTION);
    // 300 of the 480-minute budget already consumed. `activeSince` is reset
    // to now too, so `complete()` folding in elapsed active time (tasks.md
    // "Definición de terminado" fix) doesn't add spurious extra minutes on
    // top of this simulated value.
    await prisma.slaClock.update({
      where: { id: before.id },
      data: { consumedMinutes: 300, activeSince: new Date() },
    });

    await service.updateStatus(ticket.id, TicketStatus.RESOLVED, agentId);
    const resolved = await slaClocks.findByTicketAndKind(ticket.id, SlaClockKind.RESOLUTION);
    expect(resolved.id).toBe(before.id);
    expect(resolved.completedAt).not.toBeNull();

    await service.updateStatus(ticket.id, TicketStatus.OPEN, agentId);
    const reopened = await slaClocks.findByTicketAndKind(ticket.id, SlaClockKind.RESOLUTION);

    // Same row, not a newly-created one — @@unique([ticketId, kind]) also
    // guarantees this at the DB level, but asserting the id is the direct
    // proof.
    expect(reopened.id).toBe(before.id);
    expect(reopened.completedAt).toBeNull();
    expect(reopened.dueAt).not.toBeNull();
    if (!reopened.dueAt) {
      throw new Error('expected dueAt to be set after reactivation');
    }
    // `complete()` folds in whatever real business time elapsed between the
    // `activeSince` reset above and this test's own `updateStatus(RESOLVED)`
    // call (tasks.md "Definición de terminado" fix), so `resolved.consumedMinutes`
    // is not guaranteed to stay exactly 300 — read the real persisted value
    // and compute the expected `dueAt` through the SAME engine function
    // `reactivate()` itself uses, rather than assuming naive `480 - 300`
    // wall-clock arithmetic, which silently loses a minute whenever the real
    // moment this runs crosses `ALWAYS_OPEN_CALENDAR`'s one real daily gap
    // (23:59-00:00, see that constant's doc comment).
    const expectedRemaining = Math.max(480 - resolved.consumedMinutes, 0);
    const expectedDueAt = addBusinessMinutes(reopened.activeSince, expectedRemaining, ALWAYS_OPEN_CALENDAR);
    expect(reopened.dueAt.getTime()).toBe(expectedDueAt.getTime());

    // Reopening never touches the already-completed FIRST_RESPONSE clock.
    const firstResponseAfterReopen = await slaClocks.findByTicketAndKind(
      ticket.id,
      SlaClockKind.FIRST_RESPONSE,
    );
    expect(firstResponseAfterReopen.completedAt).toEqual(
      firstResponseBeforeResolve.completedAt,
    );
  });

  it('reopening a ticket whose RESOLUTION clock had already breached before being resolved reactivates it with zero remaining minutes (immediately due) and clears breachedAt', async () => {
    const ticket = await createTicket(TicketPriority.NORMAL); // resolutionMinutes = 480
    await service.claimTicket(ticket.id, agentId);

    const before = await slaClocks.findByTicketAndKind(ticket.id, SlaClockKind.RESOLUTION);
    // Simulate the clock having already consumed its whole budget and
    // breached before the ticket was ever resolved. `activeSince` reset to
    // now so complete()'s elapsed-time folding doesn't push consumedMinutes
    // past what this test intends to assert on.
    await prisma.slaClock.update({
      where: { id: before.id },
      data: {
        consumedMinutes: 480,
        activeSince: new Date(),
        breachedAt: new Date(Date.now() - 5 * 60_000),
      },
    });

    await service.updateStatus(ticket.id, TicketStatus.RESOLVED, agentId);
    const resolved = await slaClocks.findByTicketAndKind(ticket.id, SlaClockKind.RESOLUTION);
    expect(resolved.completedAt).not.toBeNull();
    // complete() sets completedAt/dueAt/consumedMinutes — breachedAt survives resolution.
    expect(resolved.breachedAt).not.toBeNull();

    await service.updateStatus(ticket.id, TicketStatus.OPEN, agentId);
    const reopened = await slaClocks.findByTicketAndKind(ticket.id, SlaClockKind.RESOLUTION);

    expect(reopened.id).toBe(before.id);
    expect(reopened.completedAt).toBeNull();
    expect(reopened.breachedAt).toBeNull();
    expect(reopened.dueAt).not.toBeNull();
    if (!reopened.dueAt) {
      throw new Error('expected dueAt to be set after reactivation');
    }
    // Remaining minutes clamp to 0 -> the always-open calendar means dueAt
    // equals activeSince exactly (immediately due).
    const remainingMinutes = Math.round(
      (reopened.dueAt.getTime() - reopened.activeSince.getTime()) / 60_000,
    );
    expect(remainingMinutes).toBe(0);
  });
});
