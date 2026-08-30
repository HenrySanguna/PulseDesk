import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { context } from '@opentelemetry/api';
import { Worker, type Job } from 'bullmq';
import type Redis from 'ioredis';
import { extractTraceContext, getTracer } from '../observability/trace-propagation.js';
import { SLA_WORKER_CONNECTION } from './sla-connections.providers.js';
import type { SlaDueJobData } from './sla-queue.service.js';
import { SLA_QUEUE_NAME } from './sla-queue.constants.js';
import { SlaClockService } from './sla-clock.service.js';

/**
 * Consumer side of the `sla` queue (tasks.md 4.1): when a clock's due job
 * fires, delegates entirely to `SlaClockService.breach()`, which owns both
 * idempotency layers from design.md. This class is deliberately thin — it
 * has no business logic of its own to keep duplicated between here and
 * `SlaSweepConsumer` (both call the same `breach()`).
 */
@Injectable()
export class SlaConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SlaConsumer.name);
  private worker?: Worker<SlaDueJobData>;

  constructor(
    @Inject(SLA_WORKER_CONNECTION) private readonly connection: Redis,
    private readonly slaClockService: SlaClockService,
  ) {}

  onModuleInit(): void {
    this.worker = new Worker<SlaDueJobData>(
      SLA_QUEUE_NAME,
      (job) => this.process(job),
      { connection: this.connection },
    );
    this.worker.on('error', (err) => {
      this.logger.warn(`SLA worker error: ${err.message}`);
    });
    this.worker.on('failed', (job, err) => {
      this.logger.warn(`SLA job ${job?.id ?? '(unknown)'} failed: ${err.message}`);
    });
  }

  /** Runs the actual breach inside the span/context extracted from the
   * job's `traceContext` (06-add-polish tasks.md 4.2/4.3, "point 3" of the
   * four-point trace) — every downstream `await` in `breach()`, including
   * `RealtimeEventBusService.publish`'s own span ("point 4"), inherits this
   * SAME trace via `AsyncLocalStorageContextManager`. */
  async process(job: Job<SlaDueJobData>): Promise<void> {
    const extracted = extractTraceContext(job.data.traceContext);
    await context.with(extracted, () =>
      getTracer().startActiveSpan('sla.consumer.process', async (span) => {
        try {
          await this.slaClockService.breach(job.data.clockId);
        } finally {
          span.end();
        }
      }),
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }
}
