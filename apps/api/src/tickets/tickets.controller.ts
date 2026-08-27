import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { PublicAgent } from '@pulsedesk/db';
import { AgentSessionGuard } from '../auth/agent-session.guard.js';
import { CurrentAgent } from '../auth/decorators/current-agent.decorator.js';
import { CreateMessageDto } from './dto/create-message.dto.js';
import { CreateTicketDto } from './dto/create-ticket.dto.js';
import { ListTicketsQueryDto } from './dto/list-tickets.dto.js';
import { UpdateTicketStatusDto } from './dto/update-ticket-status.dto.js';
import {
  resolveTicketRequester,
  type TicketAuthenticatedRequest,
} from './ticket-request.js';
import { TicketRequesterGuard } from './ticket-requester.guard.js';
import { TicketsService } from './tickets.service.js';
import { WidgetCustomerScoped } from '../widget/widget-customer-scoped.decorator.js';

@Controller('tickets')
export class TicketsController {
  constructor(private readonly tickets: TicketsService) {}

  @UseGuards(AgentSessionGuard)
  @Post()
  create(@Body() dto: CreateTicketDto) {
    return this.tickets.createTicket(dto);
  }

  @UseGuards(AgentSessionGuard)
  @Get()
  list(@Query() query: ListTicketsQueryDto) {
    return this.tickets.listTickets(query);
  }

  /** Reachable by both actor kinds: agents get the full thread, customers
   * get their own ticket with only public messages — filtering happens in
   * `TicketsService`'s Prisma `WHERE` clause, not here.
   *
   * `:id` is the ticket id, not a conversation id — a ticket has no single
   * owning conversation, so `WidgetTokenGuard` can't scope this by
   * `conversationId` the way it does for `/widget/conversations/:conversationId`
   * routes. `@WidgetCustomerScoped()` makes that an explicit, reviewed
   * choice: any non-expired widget token for this customer can read any of
   * that SAME customer's tickets (never another customer's — `customerId`
   * comes from the signed JWT, not from client input). Without the
   * decorator, `WidgetTokenGuard` would reject this route outright. */
  @UseGuards(TicketRequesterGuard)
  @WidgetCustomerScoped()
  @Get(':id')
  getOne(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: TicketAuthenticatedRequest,
  ) {
    const requester = resolveTicketRequester(request);
    return requester.kind === 'agent'
      ? this.tickets.getTicketForAgent(id)
      : this.tickets.getTicketForCustomer(id, requester.customerId);
  }

  @UseGuards(AgentSessionGuard)
  @Post(':id/claim')
  claim(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentAgent() agent: PublicAgent,
  ) {
    return this.tickets.claimTicket(id, agent.id);
  }

  @UseGuards(AgentSessionGuard)
  @Patch(':id/status')
  updateStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateTicketStatusDto,
    @CurrentAgent() agent: PublicAgent,
  ) {
    return this.tickets.updateStatus(id, dto.status, agent.id);
  }

  @UseGuards(AgentSessionGuard)
  @Post(':id/messages')
  addMessage(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CreateMessageDto,
    @CurrentAgent() agent: PublicAgent,
  ) {
    return this.tickets.addMessage(id, dto, agent.id);
  }
}
