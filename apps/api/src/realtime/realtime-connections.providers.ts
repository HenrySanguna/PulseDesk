import type { Provider } from '@nestjs/common';
import type Redis from 'ioredis';
import { createValkeyClient } from '@pulsedesk/db';

/**
 * DI tokens for the two dedicated Valkey connections the realtime event bus
 * needs (tasks.md section 3 — "bus de eventos worker -> API"). Same split
 * rationale as `apps/api/src/sla/sla-connections.providers.ts`'s
 * producer/worker connections: a client that calls `.subscribe()` enters
 * Valkey subscriber mode and can no longer issue regular commands (INCR,
 * LPUSH, PUBLISH), so the buffer/publish side and the live-subscribe side
 * each need their own connection.
 */
export const REALTIME_CONNECTION = Symbol('REALTIME_CONNECTION');
export const REALTIME_SUBSCRIBER_CONNECTION = Symbol('REALTIME_SUBSCRIBER_CONNECTION');

function connectionProvider(token: symbol): Provider {
  return {
    provide: token,
    useFactory: (): Redis => createValkeyClient(process.env['REDIS_URL'] as string),
  };
}

export const realtimeConnectionProviders: Provider[] = [
  connectionProvider(REALTIME_CONNECTION),
  connectionProvider(REALTIME_SUBSCRIBER_CONNECTION),
];
