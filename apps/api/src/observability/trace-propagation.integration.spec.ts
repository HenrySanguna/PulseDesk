import 'dotenv/config';
import { context, propagation, trace } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createValkeyClient, PrismaService, SlaClockKind } from '@pulsedesk/db';
import { BusinessCalendarRepository } from '../sla/business-calendar.repository.js';
import { createBullMqConnection } from '../sla/bullmq-connection.provider.js';
import { SlaClockRepository } from '../sla/sla-clock.repository.js';
import { SlaClockService } from '../sla/sla-clock.service.js';
import { SlaConsumer } from '../sla/sla.consumer.js';
import { SlaQueueService } from '../sla/sla-queue.service.js';
import { ensureAlwaysOpenCalendar, seedTicketForSla } from '../sla/sla-test-fixtures.js';
import { RealtimeEventBusService } from '../realtime/realtime-event-bus.service.js';
import { waitFor } from '../realtime/realtime-test-fixtures.js';
import { getTracer } from './trace-propagation.js';

/**
 * Real Postgres + real Valkey/BullMQ proof of tasks.md 4.2/4.3 and spec
 * "Traza completa de un vencimiento de SLA" — the exact scenario: an HTTP
 * request schedules an SLA due job, the job is processed by the worker
 * (`SlaConsumer`, this repo's "worker" side — see "Nota de arquitectura"),
 * and the resulting event publish toward SSE clients all share ONE
 * `traceId`, reconstructible end-to-end.
 *
 * Registers its OWN test-local OTel globals (tracer provider + context
 * manager + propagator) rather than going through `main.ts`'s
 * `observability/tracing.ts` (a production bootstrap, never imported by
 * tests) — the exact same shape `@prisma/instrumentation`'s own README
 * documents for wiring up tracing manually.
 */
describe('Trace propagation through a real BullMQ job (real Postgres + real Valkey)', () => {
  const exporter = new InMemorySpanExporter();

  beforeAll(() => {
    const contextManager = new AsyncLocalStorageContextManager();
    contextManager.enable();
    context.setGlobalContextManager(contextManager);
    propagation.setGlobalPropagator(new W3CTraceContextPropagator());
    trace.setGlobalTracerProvider(
      new BasicTracerProvider({
        spanProcessors: [new SimpleSpanProcessor(exporter)],
      }),
    );
  });

  const prisma = new PrismaService();
  const bullMqConnection = createBullMqConnection(process.env['REDIS_URL'] as string);
  const workerConnection = createBullMqConnection(process.env['REDIS_URL'] as string);
  const repo = new SlaClockRepository(prisma);
  const calendars = new BusinessCalendarRepository(prisma);
  const slaQueue = new SlaQueueService(bullMqConnection);

  const busConnection = createValkeyClient(process.env['REDIS_URL'] as string);
  const busSubscriber = createValkeyClient(process.env['REDIS_URL'] as string);
  const bus = new RealtimeEventBusService(busConnection, busSubscriber, prisma);

  const slaClockService = new SlaClockService(repo, calendars, slaQueue, prisma, bus);
  const consumer = new SlaConsumer(workerConnection, slaClockService);

  const suffix = `trace-${Date.now()}`;
  const ticketIds: string[] = [];
  const clockIds: string[] = [];
  const customerIds: string[] = [];

  beforeAll(async () => {
    await ensureAlwaysOpenCalendar(prisma);
    // Drains any stale waiting/delayed `sla` jobs left over from other test
    // runs against this same shared dev Valkey instance — this suite's
    // single worker must only ever process the ONE job it itself enqueues
    // below, so span-filtering-by-traceId has a clean baseline.
    await slaQueue.queue.drain(true);
    await bus.onModuleInit();
    consumer.onModuleInit();
  });

  afterAll(async () => {
    await consumer.onModuleDestroy();
    await bus.onModuleDestroy();
    await prisma.ticketEvent.deleteMany({ where: { ticketId: { in: ticketIds } } });
    await prisma.slaClock.deleteMany({ where: { id: { in: clockIds } } });
    await prisma.ticket.deleteMany({ where: { id: { in: ticketIds } } });
    await prisma.customer.deleteMany({ where: { id: { in: customerIds } } });
    await slaQueue.onModuleDestroy();
    await bullMqConnection.quit();
    await workerConnection.quit();
    await busConnection.quit();
    await busSubscriber.quit();
    await prisma.$disconnect();
    // 06-add-polish WARNING 1 (flakiness investigation): `@opentelemetry/api`
    // stores its global context manager / tracer provider / propagator on
    // `globalThis` (deliberately — so multiple bundled copies of the API in
    // one process share a single registration), and this suite's own
    // `beforeAll` above registers a REAL `AsyncLocalStorageContextManager` +
    // `BasicTracerProvider` there. Vitest's default thread pool reuses OS
    // worker threads (and their `globalThis`) across multiple test FILES, so
    // without unregistering these here, every OTel global set above would
    // keep leaking into whichever sibling spec file happens to run next in
    // the SAME worker thread — altering their async/microtask timing
    // (`AsyncLocalStorage` context propagation has real overhead) even
    // though those files have nothing to do with tracing. `.disable()` is
    // the official `@opentelemetry/api` teardown for exactly this: it both
    // calls the underlying manager's own `disable()` and unregisters the
    // global, restoring the process to its pre-suite no-op state.
    context.disable();
    trace.disable();
    propagation.disable();
  });

  it('4.3: the HTTP request, the queued job, its worker processing, and the resulting bus publish all share one traceId', async () => {
    const seeded = await seedTicketForSla(prisma, suffix);
    ticketIds.push(seeded.ticketId);
    customerIds.push(seeded.customerId);

    // "Point 1": simulates the incoming HTTP request that creates a ticket
    // and schedules its SLA due job — a real, ended root span, exactly like
    // `@opentelemetry/instrumentation-http` would produce for a real
    // `POST /tickets` request (proven separately: instrumenting the real
    // bundled `apps/api` production build and hitting `GET /health` over a
    // real HTTP connection produces a real `@opentelemetry/instrumentation-http`
    // span — auto-instrumentation itself isn't Vitest-reachable the way this
    // manual-propagation mechanism is, see tasks.md 4.1's evidence note).
    const rootSpan = getTracer().startSpan('http.request.simulated');
    const httpTraceId = rootSpan.spanContext().traceId;

    // "Point 2": `SlaQueueService.scheduleDueJob` (called from WITHIN the
    // root span's active context) injects that SAME context into the job's
    // `traceContext` — the actual mechanism tasks.md 4.2 asks for.
    const clock = await context.with(trace.setSpan(context.active(), rootSpan), async () => {
      const dueAt = new Date(Date.now() + 300);
      const created = await prisma.slaClock.create({
        data: {
          ticketId: seeded.ticketId,
          kind: SlaClockKind.RESOLUTION,
          targetMinutes: 1,
          dueAt,
          activeSince: new Date(),
        },
      });
      await slaQueue.scheduleDueJob(created, dueAt);
      return created;
    });
    clockIds.push(clock.id);
    rootSpan.end();

    // "Point 3": the real `SlaConsumer` worker picks up the real BullMQ job
    // and processes it — same poll-until-breached pattern
    // `sla.consumer.integration.spec.ts`'s own end-to-end test uses (`waitFor`
    // takes a SYNCHRONOUS predicate, so a real-Postgres poll needs its own
    // loop rather than reusing it directly here).
    const deadline = Date.now() + 5000;
    let persisted = await prisma.slaClock.findUniqueOrThrow({ where: { id: clock.id } });
    while (!persisted.breachedAt && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      persisted = await prisma.slaClock.findUniqueOrThrow({ where: { id: clock.id } });
    }
    expect(persisted.breachedAt).not.toBeNull();

    // "Point 4": `RealtimeEventBusService.publish` runs AFTER `breach()`'s
    // own DB transaction commits (see `SlaClockService.breach`'s source),
    // so it can still be in flight for a few more ticks right after
    // `breachedAt` is first observed above — poll for the span too, not
    // just the DB state. Filtered by `httpTraceId`, not just span name: the
    // shared Valkey/BullMQ instance this suite runs against may still be
    // processing OTHER tests' queued jobs (their spans carry a different, or
    // no, traceId), and this must isolate THIS test's own trace.
    let consumerSpan: ReturnType<typeof exporter.getFinishedSpans>[number] | undefined;
    let publishSpan: ReturnType<typeof exporter.getFinishedSpans>[number] | undefined;
    await waitFor(() => {
      const finished = exporter
        .getFinishedSpans()
        .filter((span) => span.spanContext().traceId === httpTraceId);
      consumerSpan = finished.find((span) => span.name === 'sla.consumer.process');
      publishSpan = finished.find((span) => span.name === 'realtime.event-bus.publish');
      return consumerSpan !== undefined && publishSpan !== undefined;
    });

    expect(consumerSpan).toBeDefined();
    expect(publishSpan).toBeDefined();
    expect(consumerSpan?.spanContext().traceId).toBe(httpTraceId);
    expect(publishSpan?.spanContext().traceId).toBe(httpTraceId);
  }, 10_000);
});
