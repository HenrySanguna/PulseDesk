import 'dotenv/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService, SlaClockKind, TicketEventType } from '@pulsedesk/db';
import { createBullMqConnection } from './bullmq-connection.provider.js';
import { BusinessCalendarRepository } from './business-calendar.repository.js';
import { SlaClockRepository } from './sla-clock.repository.js';
import { SlaClockService } from './sla-clock.service.js';
import { SlaConsumer } from './sla.consumer.js';
import { SlaQueueService } from './sla-queue.service.js';
import { ensureAlwaysOpenCalendar, seedTicketForSla } from './sla-test-fixtures.js';

/**
 * Real Postgres + real Valkey/BullMQ proof of tasks.md 5.1 (idempotency)
 * and the spec's second breach scenario, plus one genuine end-to-end run
 * of the real `SlaConsumer` `Worker` — the wiring (queue name, connection,
 * jobId, worker registration) is exactly what a pure service-level test
 * can't catch.
 */
describe('SlaConsumer (real Postgres + real Valkey)', () => {
  const prisma = new PrismaService();
  const producerConnection = createBullMqConnection(process.env['REDIS_URL'] as string);
  const workerConnection = createBullMqConnection(process.env['REDIS_URL'] as string);
  const repo = new SlaClockRepository(prisma);
  const calendars = new BusinessCalendarRepository(prisma);
  const slaQueue = new SlaQueueService(producerConnection);
  const service = new SlaClockService(repo, calendars, slaQueue, prisma);
  const consumer = new SlaConsumer(workerConnection, service);

  const suffix = `sla-consumer-${Date.now()}`;
  const ticketIds: string[] = [];
  const clockIds: string[] = [];
  const customerIds: string[] = [];

  beforeAll(async () => {
    await ensureAlwaysOpenCalendar(prisma);
    consumer.onModuleInit();
  });

  afterAll(async () => {
    await consumer.onModuleDestroy();
    await prisma.ticketEvent.deleteMany({ where: { ticketId: { in: ticketIds } } });
    await prisma.slaClock.deleteMany({ where: { id: { in: clockIds } } });
    await prisma.ticket.deleteMany({ where: { id: { in: ticketIds } } });
    await prisma.customer.deleteMany({ where: { id: { in: customerIds } } });
    await slaQueue.onModuleDestroy();
    await producerConnection.quit();
    await workerConnection.quit();
    await prisma.$disconnect();
  });

  async function seedTicket(label: string) {
    const seeded = await seedTicketForSla(prisma, `${suffix}-${label}`);
    ticketIds.push(seeded.ticketId);
    customerIds.push(seeded.customerId);
    return seeded.ticketId;
  }

  it('5.1: breaching the same clock twice produces exactly one SLA_BREACHED event', async () => {
    const ticketId = await seedTicket('idempotent');
    const clock = await prisma.slaClock.create({
      data: {
        ticketId,
        kind: SlaClockKind.RESOLUTION,
        targetMinutes: 1,
        dueAt: new Date(Date.now() - 60_000), // already due
        activeSince: new Date(Date.now() - 120_000),
      },
    });
    clockIds.push(clock.id);

    const first = await service.breach(clock.id);
    // Simulates re-execution of the "same job" (BullMQ retry, or the sweep
    // finding the same clock again) — the exact tasks.md 5.1 scenario.
    const second = await service.breach(clock.id);

    expect(first?.breachedAt).not.toBeNull();
    expect(second?.breachedAt).toEqual(first?.breachedAt);

    const events = await prisma.ticketEvent.findMany({
      where: { ticketId, type: TicketEventType.SLA_BREACHED },
    });
    expect(events).toHaveLength(1);
  });

  it('spec scenario: a clock already breached by its point-in-time job is skipped by a later sweep pass over the same id', async () => {
    const ticketId = await seedTicket('already-breached');
    const clock = await prisma.slaClock.create({
      data: {
        ticketId,
        kind: SlaClockKind.RESOLUTION,
        targetMinutes: 1,
        dueAt: new Date(Date.now() - 60_000),
        activeSince: new Date(Date.now() - 120_000),
      },
    });
    clockIds.push(clock.id);

    await service.breach(clock.id); // the point-in-time job already ran

    // The clock is no longer a sweep candidate — `breachedAt` excludes it
    // from `findDueForSweep`'s WHERE clause.
    const dueForSweep = await repo.findDueForSweep(new Date());
    expect(dueForSweep.map((c) => c.id)).not.toContain(clock.id);

    const events = await prisma.ticketEvent.findMany({
      where: { ticketId, type: TicketEventType.SLA_BREACHED },
    });
    expect(events).toHaveLength(1);
  });

  it('breach() is a no-op for a paused or completed clock', async () => {
    const ticketId = await seedTicket('paused-completed');
    const pausedClock = await prisma.slaClock.create({
      data: {
        ticketId,
        kind: SlaClockKind.FIRST_RESPONSE,
        targetMinutes: 1,
        dueAt: null,
        activeSince: new Date(),
        pausedAt: new Date(),
      },
    });
    clockIds.push(pausedClock.id);

    const result = await service.breach(pausedClock.id);
    expect(result).toBeNull();

    const persisted = await prisma.slaClock.findUniqueOrThrow({ where: { id: pausedClock.id } });
    expect(persisted.breachedAt).toBeNull();
  });

  it('the real SlaConsumer worker processes a scheduled due job end-to-end and breaches the clock', async () => {
    const ticketId = await seedTicket('e2e-worker');
    const dueAt = new Date(Date.now() + 300);
    const clock = await prisma.slaClock.create({
      data: {
        ticketId,
        kind: SlaClockKind.RESOLUTION,
        targetMinutes: 1,
        dueAt,
        activeSince: new Date(),
      },
    });
    clockIds.push(clock.id);

    await slaQueue.scheduleDueJob(clock, dueAt);

    // Poll instead of a fixed sleep — real worker processing time varies
    // slightly under load, but this must resolve well within a few seconds.
    const deadline = Date.now() + 5000;
    let persisted = await prisma.slaClock.findUniqueOrThrow({ where: { id: clock.id } });
    while (!persisted.breachedAt && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      persisted = await prisma.slaClock.findUniqueOrThrow({ where: { id: clock.id } });
    }

    expect(persisted.breachedAt).not.toBeNull();
    const events = await prisma.ticketEvent.findMany({
      where: { ticketId, type: TicketEventType.SLA_BREACHED },
    });
    expect(events).toHaveLength(1);
  }, 10_000);
});
