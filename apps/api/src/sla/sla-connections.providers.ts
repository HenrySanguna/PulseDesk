import type { Provider } from '@nestjs/common';
import type Redis from 'ioredis';
import { createBullMqConnection } from './bullmq-connection.provider.js';

/**
 * DI tokens for the dedicated Valkey connections BullMQ needs (see
 * `bullmq-connection.provider.ts` for why these can't reuse the shared
 * `VALKEY_CLIENT`).
 *
 * One connection is shared by the three producer-side `Queue` wrappers
 * (`SlaQueueService`, `AssignmentQueueService`, `MaintenanceQueueService`)
 * — `Queue` never issues blocking commands, so sharing is the documented
 * BullMQ-safe way to avoid opening three producer connections. Each
 * `Worker`, however, gets its own dedicated connection: a `Worker` DOES
 * block on that connection while waiting for jobs, and would otherwise
 * starve the other consumers sharing it.
 */
export const BULLMQ_PRODUCER_CONNECTION = Symbol('BULLMQ_PRODUCER_CONNECTION');
export const SLA_WORKER_CONNECTION = Symbol('SLA_WORKER_CONNECTION');
export const ASSIGNMENT_WORKER_CONNECTION = Symbol('ASSIGNMENT_WORKER_CONNECTION');
export const MAINTENANCE_WORKER_CONNECTION = Symbol('MAINTENANCE_WORKER_CONNECTION');

function connectionProvider(token: symbol): Provider {
  return {
    provide: token,
    useFactory: (): Redis => createBullMqConnection(process.env['REDIS_URL'] as string),
  };
}

export const bullMqConnectionProviders: Provider[] = [
  connectionProvider(BULLMQ_PRODUCER_CONNECTION),
  connectionProvider(SLA_WORKER_CONNECTION),
  connectionProvider(ASSIGNMENT_WORKER_CONNECTION),
  connectionProvider(MAINTENANCE_WORKER_CONNECTION),
];
