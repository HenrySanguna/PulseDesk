import 'dotenv/config';
import type { MessageEvent } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createValkeyClient, PrismaService } from '@pulsedesk/db';
import { RealtimeEventBusService } from './realtime-event-bus.service.js';
import { RealtimeSseService } from './realtime-sse.service.js';
import { waitFor } from './realtime-test-fixtures.js';

/**
 * Real Valkey proof of tasks.md 1.3 / spec "Reanudación de flujo SSE sin
 * pérdida de eventos" (test 5.1): a client that reconnects with the id of
 * the last event it saw receives exactly the events published while it was
 * disconnected — no duplicates, no gaps — via `RealtimeSseService`'s actual
 * backlog+live merge, not a shortcut around it.
 *
 * Runs against a shared Valkey instance (same as every other integration
 * spec in this repo) — `DASHBOARD_CHANNEL`/`DASHBOARD_BUFFER_KEY` are
 * process-wide, so every published event carries a unique `runTag` in its
 * payload and every assertion filters by it, the same defensive pattern
 * `04-add-sla-jobs`'s "Nota de alcance" already documents for shared-Postgres
 * test concurrency.
 */
describe('RealtimeSseService (real Valkey)', () => {
  const prisma = new PrismaService();
  const connection = createValkeyClient(process.env['REDIS_URL'] as string);
  const subscriber = createValkeyClient(process.env['REDIS_URL'] as string);
  const bus = new RealtimeEventBusService(connection, subscriber, prisma);
  const sse = new RealtimeSseService(bus);
  const runTag = `sse-resume-${Date.now()}`;

  beforeAll(async () => {
    await bus.onModuleInit();
  });

  afterAll(async () => {
    await bus.onModuleDestroy();
    await connection.quit();
    await subscriber.quit();
    await prisma.$disconnect();
  });

  it('5.1: reconnecting with Last-Event-ID replays exactly the events missed while disconnected, no duplicates, no gaps', async () => {
    await bus.publish('test.tick', { runTag, n: 1 });
    const e2 = await bus.publish('test.tick', { runTag, n: 2 });
    // The client "was connected" up to e2 and then dropped — e2.id is the
    // Last-Event-ID it would resend on reconnect.
    const lastSeenId = e2.id;

    // Published while the client was disconnected — must be replayed.
    const e3 = await bus.publish('test.tick', { runTag, n: 3 });

    const received: MessageEvent[] = [];
    const isOurs = (msg: MessageEvent): boolean =>
      typeof msg.data === 'object' &&
      msg.data !== null &&
      (msg.data as Record<string, unknown>)['runTag'] === runTag;

    const subscription = sse.streamDashboard(lastSeenId).subscribe((msg) => {
      if (isOurs(msg)) {
        received.push(msg);
      }
    });

    await waitFor(() => received.some((m) => m.id === String(e3.id)));

    // Published while the client is live/connected — must arrive too,
    // exactly once, after the backlog.
    const e4 = await bus.publish('test.tick', { runTag, n: 4 });
    await waitFor(() => received.some((m) => m.id === String(e4.id)));

    subscription.unsubscribe();

    const ids = received.map((m) => Number(m.id));
    // Exactly the missed backlog event and the live event, in order — e1
    // and e2 (already seen before "reconnect") never repeat.
    expect(ids).toEqual([e3.id, e4.id]);
  });

  it('a fresh connection (sinceId = 0) receives the full current buffer once, still no duplicates', async () => {
    const tag = `${runTag}-fresh`;
    const e1 = await bus.publish('test.tick', { runTag: tag, n: 1 });
    const e2 = await bus.publish('test.tick', { runTag: tag, n: 2 });

    const received: MessageEvent[] = [];
    const isOurs = (msg: MessageEvent): boolean =>
      typeof msg.data === 'object' &&
      msg.data !== null &&
      (msg.data as Record<string, unknown>)['runTag'] === tag;

    const subscription = sse.streamDashboard(0).subscribe((msg) => {
      if (isOurs(msg)) {
        received.push(msg);
      }
    });

    await waitFor(() => received.some((m) => m.id === String(e2.id)));
    subscription.unsubscribe();

    expect(received.map((m) => Number(m.id))).toEqual([e1.id, e2.id]);
  });
});
