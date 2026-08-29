import { Logger } from '@nestjs/common';
import Redis from 'ioredis';

const logger = new Logger('BullMqConnection');

/**
 * Creates a dedicated Valkey/Redis connection for one BullMQ `Queue` or
 * `Worker`. Deliberately NOT the shared `VALKEY_CLIENT` from `@pulsedesk/db`
 * (used by sessions/health/heartbeat): BullMQ requires
 * `maxRetriesPerRequest: null` on any connection used by a `Worker`
 * (it issues blocking commands that must not be interrupted by ioredis's
 * own retry logic), which is incompatible with `VALKEY_CLIENT`'s
 * `maxRetriesPerRequest: 1`. Each `Queue`/`Worker` gets its own instance
 * (not shared) — the documented BullMQ recommendation, since a `Worker`'s
 * blocking wait would otherwise starve other consumers of the connection.
 */
export function createBullMqConnection(url: string): Redis {
  const client = new Redis(url, {
    maxRetriesPerRequest: null,
    retryStrategy: (attempt: number) => Math.min(attempt * 200, 2000),
  });
  client.on('error', (err: Error) => {
    logger.warn(`BullMQ Valkey connection error: ${err.message}`);
  });
  return client;
}
