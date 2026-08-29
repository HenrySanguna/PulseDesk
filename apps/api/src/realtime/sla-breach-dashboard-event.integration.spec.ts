import 'dotenv/config';
import type { MessageEvent } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createValkeyClient, PrismaService, SlaClockKind } from '@pulsedesk/db';
import { BusinessCalendarRepository } from '../sla/business-calendar.repository.js';
import { createBullMqConnection } from '../sla/bullmq-connection.provider.js';
import { SlaClockRepository } from '../sla/sla-clock.repository.js';
import { SlaClockService } from '../sla/sla-clock.service.js';
import { SlaQueueService } from '../sla/sla-queue.service.js';
import { ensureAlwaysOpenCalendar, seedTicketForSla } from '../sla/sla-test-fixtures.js';
import { DASHBOARD_EVENT_TYPE } from './realtime-event.js';
import { RealtimeEventBusService } from './realtime-event-bus.service.js';
import { RealtimeSseService } from './realtime-sse.service.js';
import { waitFor } from './realtime-test-fixtures.js';

/**
 * Real Postgres + real Valkey proof of tasks.md 3.1/3.2 and spec
 * "Propagación de eventos generados por el worker" (test 5.3): a breach
 * recorded by the SLA "worker" path (`SlaClockService.breach()`, called by
 * `SlaConsumer`/`SlaSweepConsumer` in this repo's single-process
 * architecture — see the change's "Nota de arquitectura") reaches a client
 * connected to the SSE dashboard stream, over a REAL `PUBLISH`/`SUBSCRIBE`
 * round trip through Valkey — `SlaClockService` and `RealtimeSseService`
 * here are wired through two entirely separate Valkey connections, the same
 * way two different `apps/api` processes would be.
 */
describe('SLA breach -> dashboard SSE event (real Postgres + real Valkey)', () => {
  const prisma = new PrismaService();
  const bullMqConnection = createBullMqConnection(process.env['REDIS_URL'] as string);
  const repo = new SlaClockRepository(prisma);
  const calendars = new BusinessCalendarRepository(prisma);
  const slaQueue = new SlaQueueService(bullMqConnection);

  // The "api" side: its own dedicated publish/subscribe connections,
  // independent of anything SlaClockService touches.
  const busConnection = createValkeyClient(process.env['REDIS_URL'] as string);
  const busSubscriber = createValkeyClient(process.env['REDIS_URL'] as string);
  const bus = new RealtimeEventBusService(busConnection, busSubscriber, prisma);
  const sse = new RealtimeSseService(bus);

  // The "worker" side: breach() published through the SAME bus instance a
  // real DI container would inject — but the event only ever reaches `sse`
  // via the real Valkey channel, not an in-process shortcut.
  const slaClockService = new SlaClockService(repo, calendars, slaQueue, prisma, bus);

  const suffix = `sla-realtime-${Date.now()}`;
  const ticketIds: string[] = [];
  const clockIds: string[] = [];
  const customerIds: string[] = [];

  beforeAll(async () => {
    await ensureAlwaysOpenCalendar(prisma);
    await bus.onModuleInit();
  });

  afterAll(async () => {
    await bus.onModuleDestroy();
    await prisma.ticketEvent.deleteMany({ where: { ticketId: { in: ticketIds } } });
    await prisma.slaClock.deleteMany({ where: { id: { in: clockIds } } });
    await prisma.ticket.deleteMany({ where: { id: { in: ticketIds } } });
    await prisma.customer.deleteMany({ where: { id: { in: customerIds } } });
    await slaQueue.onModuleDestroy();
    await bullMqConnection.quit();
    await busConnection.quit();
    await busSubscriber.quit();
    await prisma.$disconnect();
  });

  it('5.3: a breach recorded by the SLA worker path is visible to an SSE client without the api process having originated it directly', async () => {
    const seeded = await seedTicketForSla(prisma, suffix);
    ticketIds.push(seeded.ticketId);
    customerIds.push(seeded.customerId);
    const clock = await prisma.slaClock.create({
      data: {
        ticketId: seeded.ticketId,
        kind: SlaClockKind.RESOLUTION,
        targetMinutes: 1,
        dueAt: new Date(Date.now() - 60_000),
        activeSince: new Date(Date.now() - 120_000),
      },
    });
    clockIds.push(clock.id);

    const received: MessageEvent[] = [];
    const subscription = sse.streamDashboard(0).subscribe((msg) => received.push(msg));

    // Let any pre-existing backlog replay settle before taking the
    // "before" snapshot, so the causal assertion below can't be satisfied
    // by an unrelated event some other concurrently-running test published.
    await new Promise((resolve) => setTimeout(resolve, 300));
    const idsBefore = new Set(received.map((m) => m.id));

    const breached = await slaClockService.breach(clock.id);
    expect(breached?.breachedAt).not.toBeNull();

    await waitFor(() =>
      received.some((m) => m.type === DASHBOARD_EVENT_TYPE && !idsBefore.has(m.id)),
    );

    subscription.unsubscribe();
  }, 10_000);
});
