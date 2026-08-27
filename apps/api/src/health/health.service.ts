import { Inject, Injectable } from '@nestjs/common';
import {
  computeHeartbeatAgeSec,
  getContractsVersion,
  isHeartbeatStale,
  WORKER_HEARTBEAT_KEY,
} from '@pulsedesk/contracts';
import { PrismaService, VALKEY_CLIENT } from '@pulsedesk/db';
import type Redis from 'ioredis';

export type DependencyStatus = 'ok' | 'error';

export interface HealthReport {
  db: DependencyStatus;
  valkey: DependencyStatus;
  commit: string;
  contractsVersion: string;
  workerHeartbeatAgeSec: number | null;
}

/**
 * Only the Valkey commands `/health` actually needs, so unit tests can pass
 * a plain fake instead of a real `ioredis.Redis` instance.
 */
type ValkeyHealthClient = Pick<Redis, 'ping' | 'get'>;

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(VALKEY_CLIENT) private readonly valkey: ValkeyHealthClient,
  ) {}

  /** Builds the `/health` report. Never throws — dependency failures are
   * captured as `'error'` status fields instead. */
  async check(): Promise<HealthReport> {
    const [db, valkey] = await Promise.all([
      this.checkDb(),
      this.checkValkey(),
    ]);
    const workerHeartbeatAgeSec = await this.readHeartbeatAgeSec();

    return {
      db,
      valkey,
      commit: process.env['RENDER_GIT_COMMIT'] ?? 'dev',
      contractsVersion: getContractsVersion(),
      workerHeartbeatAgeSec,
    };
  }

  /** Per the observability spec: healthy requires Postgres up, Valkey up,
   * and a non-stale worker heartbeat. */
  isHealthy(report: HealthReport): boolean {
    return (
      report.db === 'ok' &&
      report.valkey === 'ok' &&
      !isHeartbeatStale(report.workerHeartbeatAgeSec)
    );
  }

  private async checkDb(): Promise<DependencyStatus> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return 'ok';
    } catch {
      return 'error';
    }
  }

  private async checkValkey(): Promise<DependencyStatus> {
    try {
      return (await this.valkey.ping()) === 'PONG' ? 'ok' : 'error';
    } catch {
      return 'error';
    }
  }

  private async readHeartbeatAgeSec(): Promise<number | null> {
    try {
      const raw = await this.valkey.get(WORKER_HEARTBEAT_KEY);
      return computeHeartbeatAgeSec(raw === null ? null : Number(raw));
    } catch {
      return null;
    }
  }
}
