import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator.js';
import { HealthReport, HealthService } from './health.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  /**
   * GET /health — per the observability spec, returns HTTP 200 with the
   * report when Postgres, Valkey, and the worker heartbeat are all healthy,
   * otherwise throws to return a non-200 status with the same report body.
   *
   * `@Public()` here is a no-op marker (no guard has ever gated this
   * endpoint): it exists only so the dual-auth route-guard-enumeration test
   * can audit the complete set of apps/api routes without a hardcoded
   * exclusion list. See apps/api/src/auth/route-guard-enumeration.spec.ts.
   */
  @Public()
  @Get()
  async check(): Promise<HealthReport> {
    const report = await this.healthService.check();
    if (!this.healthService.isHealthy(report)) {
      throw new HttpException(report, HttpStatus.SERVICE_UNAVAILABLE);
    }
    return report;
  }
}
