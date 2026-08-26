import { describe, expect, it } from 'vitest';
import { HttpException, HttpStatus } from '@nestjs/common';
import type { HealthReport, HealthService } from './health.service.js';
import { HealthController } from './health.controller.js';

function makeHealthService(report: HealthReport, healthy: boolean): HealthService {
  return {
    check: () => Promise.resolve(report),
    isHealthy: () => healthy,
  } as unknown as HealthService;
}

const okReport: HealthReport = {
  db: 'ok',
  valkey: 'ok',
  commit: 'abc1234',
  contractsVersion: '0.0.1',
  workerHeartbeatAgeSec: 3,
};

describe('HealthController', () => {
  it('returns the report directly when all dependencies are healthy', async () => {
    const controller = new HealthController(makeHealthService(okReport, true));

    await expect(controller.check()).resolves.toEqual(okReport);
  });

  it('throws a 503 HttpException carrying the report when unhealthy', async () => {
    const degradedReport: HealthReport = { ...okReport, db: 'error' };
    const controller = new HealthController(
      makeHealthService(degradedReport, false),
    );

    await expect(controller.check()).rejects.toMatchObject(
      new HttpException(degradedReport, HttpStatus.SERVICE_UNAVAILABLE),
    );
  });
});
