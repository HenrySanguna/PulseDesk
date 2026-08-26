import { Logger, type Provider } from '@nestjs/common';
import Redis from 'ioredis';

/** DI token for the shared Valkey/Redis client. */
export const VALKEY_CLIENT = Symbol('VALKEY_CLIENT');

const logger = new Logger('ValkeyClient');

/**
 * Creates the Valkey/Redis client shared by `apps/api` (health checks) and
 * `apps/worker` (heartbeat writes).
 *
 * Registers an `error` listener so failed reconnect attempts are logged
 * instead of surfacing as an unhandled `error` event, which would crash the
 * process. Callers detect connectivity failures via failed commands
 * (`ping`, `get`, `set`), not via this listener.
 */
export function createValkeyClient(url: string): Redis {
  const client = new Redis(url, {
    maxRetriesPerRequest: 1,
    retryStrategy: (attempt: number) => Math.min(attempt * 200, 2000),
  });
  client.on('error', (err: Error) => {
    logger.warn(`Valkey connection error: ${err.message}`);
  });
  return client;
}

export const valkeyProvider: Provider = {
  provide: VALKEY_CLIENT,
  useFactory: (): Redis => createValkeyClient(process.env['REDIS_URL'] as string),
};
