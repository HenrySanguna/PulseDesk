import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import type { SlaClock } from '@pulsedesk/db';
import type Redis from 'ioredis';
import { injectTraceContext } from '../observability/trace-propagation.js';
import { BULLMQ_PRODUCER_CONNECTION } from './sla-connections.providers.js';
import { SLA_QUEUE_NAME, slaDueJobId } from './sla-queue.constants.js';

export interface SlaDueJobData {
  clockId: string;
  /** The originating request's trace context, injected at enqueue time
   * (06-add-polish tasks.md 4.2) — see `observability/trace-propagation.ts`
   * for why this can't be inherited automatically. Optional so a job
   * enqueued before this change shipped (or read by an older worker
   * version during a rolling deploy) still deserializes fine. */
  traceContext?: Record<string, string>;
}

/**
 * Producer side of the `sla` queue (tasks.md 2.1/2.2/2.3): schedules and
 * cancels a clock's point-in-time due job. Never reads/writes `SlaClock`
 * itself — `SlaClockService` owns the DB write and calls this after,
 * per design.md's non-transactional-by-design pause/resume/complete flow
 * (a stale job surviving a failed cancel is caught by the consumer's
 * state-reread idempotency check, not by this class).
 */
@Injectable()
export class SlaQueueService implements OnModuleDestroy {
  readonly queue: Queue<SlaDueJobData>;

  constructor(@Inject(BULLMQ_PRODUCER_CONNECTION) connection: Redis) {
    this.queue = new Queue<SlaDueJobData>(SLA_QUEUE_NAME, { connection });
  }

  /** Schedules (or re-schedules, on the same deterministic `jobId`) the
   * due job for `clock` at `dueAt`. */
  async scheduleDueJob(
    clock: Pick<SlaClock, 'id' | 'targetMinutes'>,
    dueAt: Date,
  ): Promise<void> {
    const delay = Math.max(dueAt.getTime() - Date.now(), 0);
    await this.queue.add(
      'sla:due',
      { clockId: clock.id, traceContext: injectTraceContext() },
      {
        jobId: slaDueJobId(clock.id, clock.targetMinutes),
        delay,
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
  }

  /** Removes the due job for `clock`, if it still exists — called on pause
   * and on complete. A no-op (not an error) if the job already ran, was
   * already removed, or never existed.
   *
   * Bug found while adding `06-add-polish` tasks.md 4.3's end-to-end trace
   * test (real Postgres + real Valkey + a real `SlaConsumer` `Worker`, not
   * just a direct `breach()` call — the gap that let this go unnoticed):
   * `SlaClockService.breach()` calls this AFTER its own DB transaction
   * commits, but when `breach()` is running because THIS SAME due job's
   * `SlaConsumer.process` handler is the one currently executing it, the
   * job it's trying to cancel is itself — still ACTIVE, its processing lock
   * still held by the worker that's running this very call. BullMQ
   * correctly refuses to let a job remove itself while locked ("could not
   * be removed because it is locked by another worker"), which used to
   * propagate all the way up through `breach()` and fail the whole job —
   * harmless for the already-committed breach effect, but it silently
   * skipped `RealtimeEventBusService.publishDashboardSnapshot()` (called
   * AFTER this in `breach()`), meaning a point-in-time breach never
   * actually reached a connected dashboard SSE client in production,
   * despite `sla-breach-dashboard-event.integration.spec.ts`'s test 5.3
   * passing — that test calls `breach()` directly, never through the real
   * `Worker`, so it never exercised this exact self-cancel path. An ACTIVE
   * job needs no explicit cancellation here — `removeOnComplete: true`
   * (set at `scheduleDueJob`'s `queue.add()`) already cleans it up once
   * processing finishes. */
  async cancelDueJob(clock: Pick<SlaClock, 'id' | 'targetMinutes'>): Promise<void> {
    const jobId = slaDueJobId(clock.id, clock.targetMinutes);
    const job = await this.queue.getJob(jobId);
    if (!job) {
      return;
    }
    if (await job.isActive()) {
      return;
    }
    await job.remove();
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
