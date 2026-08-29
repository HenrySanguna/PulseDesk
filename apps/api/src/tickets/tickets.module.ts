import { Module } from '@nestjs/common';
import { PrismaService } from '@pulsedesk/db';
import { AuthModule } from '../auth/auth.module.js';
import { SlaModule } from '../sla/sla.module.js';
import { WidgetModule } from '../widget/widget.module.js';
import { TicketRequesterGuard } from './ticket-requester.guard.js';
import { TicketsController } from './tickets.controller.js';
import { TicketsService } from './tickets.service.js';

@Module({
  // AuthModule exports AgentSessionGuard, WidgetModule exports
  // WidgetTokenGuard — TicketRequesterGuard composes both for the one
  // dual-access route (`GET /tickets/:id`). SlaModule exports
  // AssignmentQueueService — every created ticket enqueues an
  // auto-assignment attempt (see TicketsService.createTicket).
  imports: [AuthModule, WidgetModule, SlaModule],
  controllers: [TicketsController],
  providers: [PrismaService, TicketsService, TicketRequesterGuard],
  // TicketsService is exported for 05-add-realtime-hybrid's RealtimeModule
  // (WidgetMessagingService reuses TicketsService.createTicket for the
  // Conversation-Ticket bridge — see realtime/widget-messaging.service.ts).
  exports: [TicketsService],
})
export class TicketsModule {}
