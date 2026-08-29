import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import type { SlaClock } from '@pulsedesk/db';
import type Redis from 'ioredis';
import { BULLMQ_PRODUCER_CONNECTION } from './sla-connections.providers.js';
import { SLA_QUEUE_NAME, slaDueJobId } from './sla-queue.constants.js';

export interface SlaDueJobData {
  clockId: string;
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
      { clockId: clock.id },
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
   * already removed, or never existed. */
  async cancelDueJob(clock: Pick<SlaClock, 'id' | 'targetMinutes'>): Promise<void> {
    const jobId = slaDueJobId(clock.id, clock.targetMinutes);
    const job = await this.queue.getJob(jobId);
    if (job) {
      await job.remove();
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
