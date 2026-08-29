import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Worker, type Job } from 'bullmq';
import type Redis from 'ioredis';
import { MAINTENANCE_WORKER_CONNECTION } from './sla-connections.providers.js';
import { MAINTENANCE_QUEUE_NAME, SLA_SWEEP_JOB_NAME } from './sla-queue.constants.js';
import { SlaClockRepository } from './sla-clock.repository.js';
import { SlaClockService } from './sla-clock.service.js';

/**
 * Consumer side of the `maintenance` queue's `sla:sweep` repeatable job
 * (tasks.md 4.3): the crash-recovery safety net from design.md — finds
 * every clock that is due, still running, and not yet breached, and routes
 * it through the SAME `SlaClockService.breach()` the point-in-time
 * `SlaConsumer` uses. This is what makes "worker was down when a clock
 * came due" recoverable: the point-in-time job never fired (or fired and
 * was lost), but the next sweep cycle finds the clock via `dueAt <= now()`
 * regardless of whether any job for it currently exists in the `sla`
 * queue.
 *
 * `sweep()` is exposed as a public method (not just the private BullMQ job
 * handler) so tests can trigger a sweep cycle directly instead of waiting
 * for the real 5-minute interval.
 */
@Injectable()
export class SlaSweepConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SlaSweepConsumer.name);
  private worker?: Worker;

  constructor(
    @Inject(MAINTENANCE_WORKER_CONNECTION) private readonly connection: Redis,
    private readonly repo: SlaClockRepository,
    private readonly slaClockService: SlaClockService,
  ) {}

  onModuleInit(): void {
    this.worker = new Worker(
      MAINTENANCE_QUEUE_NAME,
      (job) => this.handleJob(job),
      { connection: this.connection },
    );
    this.worker.on('error', (err) => {
      this.logger.warn(`Maintenance worker error: ${err.message}`);
    });
  }

  private async handleJob(job: Job): Promise<void> {
    if (job.name !== SLA_SWEEP_JOB_NAME) {
      return;
    }
    await this.sweep();
  }

  async sweep(): Promise<void> {
    const overdue = await this.repo.findDueForSweep(new Date());
    for (const clock of overdue) {
      await this.slaClockService.breach(clock.id);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }
}
