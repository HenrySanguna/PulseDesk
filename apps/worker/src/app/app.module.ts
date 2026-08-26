import { Module } from '@nestjs/common';
import { valkeyProvider } from '@pulsedesk/db';
import { HeartbeatService } from '../heartbeat/heartbeat.service.js';

@Module({
  imports: [],
  controllers: [],
  providers: [valkeyProvider, HeartbeatService],
})
export class AppModule {}
