import { beforeEach, describe, expect, it } from 'vitest';
import type { PrismaService } from '@pulsedesk/db';
import { WORKER_HEARTBEAT_KEY } from '@pulsedesk/contracts';
import { HealthService } from './health.service.js';

function makePrisma(queryRawImpl: () => Promise<unknown>): PrismaService {
  return { $queryRaw: queryRawImpl } as unknown as PrismaService;
}

function makeValkey(
  pingImpl: () => Promise<string>,
  getImpl: (key: string) => Promise<string | null>,
) {
  return { ping: pingImpl, get: getImpl };
}

describe('HealthService', () => {
  const originalGitSha = process.env['RENDER_GIT_COMMIT'];

  beforeEach(() => {
    if (originalGitSha === undefined) {
      delete process.env['RENDER_GIT_COMMIT'];
    } else {
      process.env['RENDER_GIT_COMMIT'] = originalGitSha;
    }
  });

  it('reports ok for db and valkey when both dependencies are reachable', async () => {
    const prisma = makePrisma(() => Promise.resolve([{ '?column?': 1 }]));
    const valkey = makeValkey(
      () => Promise.resolve('PONG'),
      (key) =>
        key === WORKER_HEARTBEAT_KEY
          ? Promise.resolve(String(Date.now()))
          : Promise.resolve(null),
    );
    const service = new HealthService(prisma, valkey);

    const report = await service.check();

    expect(report.db).toBe('ok');
    expect(report.valkey).toBe('ok');
    expect(service.isHealthy(report)).toBe(true);
  });

  it('reports db error and unhealthy when Postgres is unreachable', async () => {
    const prisma = makePrisma(() => Promise.reject(new Error('ECONNREFUSED')));
    const valkey = makeValkey(
      () => Promise.resolve('PONG'),
      () => Promise.resolve(String(Date.now())),
    );
    const service = new HealthService(prisma, valkey);

    const report = await service.check();

    expect(report.db).toBe('error');
    expect(service.isHealthy(report)).toBe(false);
  });

  it('reports valkey error and unhealthy when Valkey is unreachable', async () => {
    const prisma = makePrisma(() => Promise.resolve([{ '?column?': 1 }]));
    const valkey = makeValkey(
      () => Promise.reject(new Error('ECONNREFUSED')),
      () => Promise.reject(new Error('ECONNREFUSED')),
    );
    const service = new HealthService(prisma, valkey);

    const report = await service.check();

    expect(report.valkey).toBe('error');
    expect(service.isHealthy(report)).toBe(false);
  });

  it('includes the commit SHA from RENDER_GIT_COMMIT, falling back to "dev"', async () => {
    const prisma = makePrisma(() => Promise.resolve([]));
    const valkey = makeValkey(
      () => Promise.resolve('PONG'),
      () => Promise.resolve(null),
    );
    const service = new HealthService(prisma, valkey);

    delete process.env['RENDER_GIT_COMMIT'];
    expect((await service.check()).commit).toBe('dev');

    process.env['RENDER_GIT_COMMIT'] = 'abc1234';
    expect((await service.check()).commit).toBe('abc1234');
  });

  it('reports the worker heartbeat age and treats a stale one as unhealthy', async () => {
    const prisma = makePrisma(() => Promise.resolve([]));
    const staleTimestamp = Date.now() - 61_000;
    const valkey = makeValkey(
      () => Promise.resolve('PONG'),
      () => Promise.resolve(String(staleTimestamp)),
    );
    const service = new HealthService(prisma, valkey);

    const report = await service.check();

    expect(report.workerHeartbeatAgeSec).toBeGreaterThanOrEqual(61);
    expect(service.isHealthy(report)).toBe(false);
  });

  it('treats a missing heartbeat as unhealthy', async () => {
    const prisma = makePrisma(() => Promise.resolve([]));
    const valkey = makeValkey(
      () => Promise.resolve('PONG'),
      () => Promise.resolve(null),
    );
    const service = new HealthService(prisma, valkey);

    const report = await service.check();

    expect(report.workerHeartbeatAgeSec).toBeNull();
    expect(service.isHealthy(report)).toBe(false);
  });
});

describe('HealthService.isHealthy determinism', () => {
  it('does not depend on call order (pure function of the report)', () => {
    const prisma = makePrisma(() => Promise.resolve([]));
    const valkey = makeValkey(
      () => Promise.resolve('PONG'),
      () => Promise.resolve(null),
    );
    const service = new HealthService(prisma, valkey);
    const healthyReport = {
      db: 'ok' as const,
      valkey: 'ok' as const,
      commit: 'dev',
      contractsVersion: '0.0.1',
      workerHeartbeatAgeSec: 1,
    };
    expect(service.isHealthy(healthyReport)).toBe(true);
    expect(service.isHealthy(healthyReport)).toBe(true);
  });
});

