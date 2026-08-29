import 'dotenv/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService, SlaClockKind, TicketEventType } from '@pulsedesk/db';
import { createBullMqConnection } from './bullmq-connection.provider.js';
import { BusinessCalendarRepository } from './business-calendar.repository.js';
import { SlaClockRepository } from './sla-clock.repository.js';
import { SlaClockService } from './sla-clock.service.js';
import { SlaQueueService } from './sla-queue.service.js';
import { SlaSweepConsumer } from './sla-sweep.consumer.js';
import { ensureAlwaysOpenCalendar, seedTicketForSla } from './sla-test-fixtures.js';

/**
 * Real Postgres + real Valkey proof of tasks.md 5.5 and the "Definición de
 * terminado" recovery scenario: a clock whose `dueAt` has already passed
 * with NO active job in the `sla` queue (simulating the worker having been
 * down at the exact moment it should have fired) is still recovered — by
 * the sweep, not by any queue job.
 */
describe('SlaSweepConsumer (real Postgres + real Valkey)', () => {
  const prisma = new PrismaService();
  const connection = createBullMqConnection(process.env['REDIS_URL'] as string);
  const repo = new SlaClockRepository(prisma);
  const calendars = new BusinessCalendarRepository(prisma);
  const slaQueue = new SlaQueueService(connection);
  const service = new SlaClockService(repo, calendars, slaQueue, prisma);
  const sweepConsumer = new SlaSweepConsumer(connection, repo, service);

  const suffix = `sla-sweep-${Date.now()}`;
  const ticketIds: string[] = [];
  const clockIds: string[] = [];
  const customerIds: string[] = [];

  beforeAll(async () => {
    await ensureAlwaysOpenCalendar(prisma);
  });

  afterAll(async () => {
    await prisma.ticketEvent.deleteMany({ where: { ticketId: { in: ticketIds } } });
    await prisma.slaClock.deleteMany({ where: { id: { in: clockIds } } });
    await prisma.ticket.deleteMany({ where: { id: { in: ticketIds } } });
    await prisma.customer.deleteMany({ where: { id: { in: customerIds } } });
    await slaQueue.onModuleDestroy();
    await connection.quit();
    await prisma.$disconnect();
  });

  async function seedTicket(label: string) {
    const seeded = await seedTicketForSla(prisma, `${suffix}-${label}`);
    ticketIds.push(seeded.ticketId);
    customerIds.push(seeded.customerId);
    return seeded.ticketId;
  }

  it('5.5 / Definición de terminado: the sweep recovers an overdue clock with no active queue job (simulated worker-down)', async () => {
    const ticketId = await seedTicket('recovered');
    // Deliberately created with a past dueAt and WITHOUT ever calling
    // `slaQueue.scheduleDueJob` — there is no job for this clock anywhere
    // in the `sla` queue, exactly as if the process scheduling it had
    // crashed before enqueueing (or the point-in-time job itself was lost).
    const clock = await prisma.slaClock.create({
      data: {
        ticketId,
        kind: SlaClockKind.RESOLUTION,
        targetMinutes: 30,
        dueAt: new Date(Date.now() - 10 * 60_000),
        activeSince: new Date(Date.now() - 40 * 60_000),
      },
    });
    clockIds.push(clock.id);

    await sweepConsumer.sweep();

    const persisted = await prisma.slaClock.findUniqueOrThrow({ where: { id: clock.id } });
    expect(persisted.breachedAt).not.toBeNull();

    const events = await prisma.ticketEvent.findMany({
      where: { ticketId, type: TicketEventType.SLA_BREACHED },
    });
    expect(events).toHaveLength(1);
  });

  it('the sweep does not touch a clock whose dueAt is still in the future', async () => {
    const ticketId = await seedTicket('not-due-yet');
    const clock = await prisma.slaClock.create({
      data: {
        ticketId,
        kind: SlaClockKind.RESOLUTION,
        targetMinutes: 30,
        dueAt: new Date(Date.now() + 30 * 60_000),
        activeSince: new Date(),
      },
    });
    clockIds.push(clock.id);

    await sweepConsumer.sweep();

    const persisted = await prisma.slaClock.findUniqueOrThrow({ where: { id: clock.id } });
    expect(persisted.breachedAt).toBeNull();
  });

  it('running two sweep passes back to back over the same recovered clock still produces exactly one event', async () => {
    const ticketId = await seedTicket('sweep-twice');
    const clock = await prisma.slaClock.create({
      data: {
        ticketId,
        kind: SlaClockKind.FIRST_RESPONSE,
        targetMinutes: 15,
        dueAt: new Date(Date.now() - 5 * 60_000),
        activeSince: new Date(Date.now() - 20 * 60_000),
      },
    });
    clockIds.push(clock.id);

    await sweepConsumer.sweep();
    await sweepConsumer.sweep();

    const events = await prisma.ticketEvent.findMany({
      where: { ticketId, type: TicketEventType.SLA_BREACHED },
    });
    expect(events).toHaveLength(1);
  });
});
