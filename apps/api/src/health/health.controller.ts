import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { HealthReport, HealthService } from './health.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  /**
   * GET /health — per the observability spec, returns HTTP 200 with the
   * report when Postgres, Valkey, and the worker heartbeat are all healthy,
   * otherwise throws to return a non-200 status with the same report body.
   */
  @Get()
  async check(): Promise<HealthReport> {
    const report = await this.healthService.check();
    if (!this.healthService.isHealthy(report)) {
      throw new HttpException(report, HttpStatus.SERVICE_UNAVAILABLE);
    }
    return report;
  }
}
