import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import type Redis from 'ioredis';
import { BULLMQ_PRODUCER_CONNECTION } from './sla-connections.providers.js';
import {
  MAINTENANCE_QUEUE_NAME,
  SLA_SWEEP_JOB_NAME,
  SLA_SWEEP_REPEAT_MS,
} from './sla-queue.constants.js';

/**
 * Producer side of the `maintenance` queue — owns registering the `sla:sweep`
 * repeatable recovery job (design.md "El barrido de recuperación").
 *
 * Uses `upsertJobScheduler` (BullMQ's idempotent scheduler API) instead of
 * the older `repeat` option: re-registering on every app boot must not
 * accumulate duplicate repeatable schedules, and `upsertJobScheduler`
 * guarantees exactly one scheduler per `schedulerId` regardless of how many
 * times it's called.
 */
@Injectable()
export class MaintenanceQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MaintenanceQueueService.name);
  readonly queue: Queue;

  constructor(@Inject(BULLMQ_PRODUCER_CONNECTION) connection: Redis) {
    this.queue = new Queue(MAINTENANCE_QUEUE_NAME, { connection });
  }

  async onModuleInit(): Promise<void> {
    await this.ensureSweepScheduled();
  }

  async ensureSweepScheduled(): Promise<void> {
    try {
      await this.queue.upsertJobScheduler(
        SLA_SWEEP_JOB_NAME,
        { every: SLA_SWEEP_REPEAT_MS },
        { name: SLA_SWEEP_JOB_NAME, data: {} },
      );
    } catch (err) {
      // Never fatal: if this fails at boot, the point-in-time `sla` jobs
      // still cover normal operation — only crash recovery is degraded
      // until the next successful boot re-attempts registration.
      this.logger.warn(`Failed to schedule sla:sweep: ${(err as Error).message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
