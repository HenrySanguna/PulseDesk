import { Inject, Injectable, Logger } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  WORKER_HEARTBEAT_INTERVAL_MS,
  WORKER_HEARTBEAT_KEY,
} from '@pulsedesk/contracts';
import { VALKEY_CLIENT } from '@pulsedesk/db';
import type Redis from 'ioredis';

/**
 * Only the Valkey command the heartbeat needs, so unit tests can pass a
 * plain fake instead of a real `ioredis.Redis` instance.
 */
type HeartbeatValkeyClient = Pick<Redis, 'set'>;

/**
 * Writes a timestamp to Valkey every {@link WORKER_HEARTBEAT_INTERVAL_MS}
 * (<=15s, per the observability spec) so `apps/api`'s `/health` endpoint can
 * detect a stalled or crashed worker.
 */
@Injectable()
export class HeartbeatService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HeartbeatService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    @Inject(VALKEY_CLIENT) private readonly valkey: HeartbeatValkeyClient,
  ) {}

  onModuleInit(): void {
    void this.writeHeartbeat();
    this.timer = setInterval(
      () => void this.writeHeartbeat(),
      WORKER_HEARTBEAT_INTERVAL_MS,
    );
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  /** Writes the current timestamp. Never throws — a failed write is logged
   * and surfaced later as a stale heartbeat by `/health`, not a crash. */
  async writeHeartbeat(): Promise<void> {
    try {
      await this.valkey.set(WORKER_HEARTBEAT_KEY, Date.now().toString());
    } catch (err) {
      this.logger.warn(
        `Failed to write worker heartbeat: ${(err as Error).message}`,
      );
    }
  }
}
