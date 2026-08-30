import { Module } from '@nestjs/common';
import { PrismaService } from '@pulsedesk/db';
import { AuthModule } from '../auth/auth.module.js';
import { CannedResponsesController } from './canned-responses.controller.js';
import { CannedResponsesService } from './canned-responses.service.js';

@Module({
  imports: [AuthModule],
  controllers: [CannedResponsesController],
  providers: [PrismaService, CannedResponsesService],
})
export class CannedResponsesModule {}
