import { Module } from '@nestjs/common';
import { PrismaService, valkeyProvider } from '@pulsedesk/db';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';

@Module({
  controllers: [HealthController],
  providers: [PrismaService, valkeyProvider, HealthService],
})
export class HealthModule {}
