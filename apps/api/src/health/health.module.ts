import { Module } from '@nestjs/common';
import { PrismaService, valkeyProvider } from '@pulsedesk/db';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';
import { HeartbeatService } from './heartbeat.service.js';

@Module({
  controllers: [HealthController],
  providers: [PrismaService, valkeyProvider, HealthService, HeartbeatService],
})
export class HealthModule {}
