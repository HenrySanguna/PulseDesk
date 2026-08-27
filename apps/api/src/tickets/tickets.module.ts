import { Module } from '@nestjs/common';
import { PrismaService } from '@pulsedesk/db';
import { AuthModule } from '../auth/auth.module.js';
import { WidgetModule } from '../widget/widget.module.js';
import { TicketRequesterGuard } from './ticket-requester.guard.js';
import { TicketsController } from './tickets.controller.js';
import { TicketsService } from './tickets.service.js';

@Module({
  // AuthModule exports AgentSessionGuard, WidgetModule exports
  // WidgetTokenGuard — TicketRequesterGuard composes both for the one
  // dual-access route (`GET /tickets/:id`).
  imports: [AuthModule, WidgetModule],
  controllers: [TicketsController],
  providers: [PrismaService, TicketsService, TicketRequesterGuard],
})
export class TicketsModule {}
