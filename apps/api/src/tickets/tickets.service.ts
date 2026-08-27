import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Message, Prisma, Ticket } from '@pulsedesk/db';
import {
  MessageVisibility,
  PrismaService,
  TicketEventType,
  TicketPriority,
  TicketStatus,
} from '@pulsedesk/db';
import type { CreateMessageDto } from './dto/create-message.dto.js';
import type { CreateTicketDto } from './dto/create-ticket.dto.js';
import type { ListTicketsQueryDto } from './dto/list-tickets.dto.js';
import { assertValidTransition } from './ticket-state-machine.js';

export interface TicketWithMessages extends Ticket {
  messages: Message[];
}

export interface ListTicketsResult {
  items: Ticket[];
  total: number;
  page: number;
  pageSize: number;
}

@Injectable()
export class TicketsService {
  constructor(private readonly prisma: PrismaService) {}

  async createTicket(dto: CreateTicketDto): Promise<Ticket> {
    return this.prisma.$transaction(async (tx) => {
      const ticket = await tx.ticket.create({
        data: {
          customerId: dto.customerId,
          subject: dto.subject,
          priority: dto.priority ?? TicketPriority.NORMAL,
        },
      });
      await tx.ticketEvent.create({
        data: { ticketId: ticket.id, type: TicketEventType.CREATED },
      });
      return ticket;
    });
  }

  /** Queue view: default order is priority DESC, then age ASC within the
   * same priority — see ticket-state-machine.js's sibling risk note on
   * `TicketPriority` declaration order in ticket.prisma. */
  async listTickets(filters: ListTicketsQueryDto): Promise<ListTicketsResult> {
    const where: Prisma.TicketWhereInput = {
      ...(filters.status && { status: filters.status }),
      ...(filters.priority && { priority: filters.priority }),
      ...(filters.assigneeId && { assigneeId: filters.assigneeId }),
    };
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 20;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.ticket.findMany({
        where,
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.ticket.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async getTicketForAgent(id: string): Promise<TicketWithMessages> {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!ticket) {
      throw new NotFoundException('TICKET_NOT_FOUND');
    }
    return ticket;
  }

  /** The visibility filter lives in this query's Prisma `WHERE`, not in a
   * post-query `.filter()` — internal notes never leave Postgres for a
   * customer-scoped read. See design.md "Notas internas: filtrado en la
   * consulta, no en el mapeo". */
  async getTicketForCustomer(
    id: string,
    customerId: string,
  ): Promise<TicketWithMessages> {
    const ticket = await this.prisma.ticket.findFirst({
      where: { id, customerId },
      include: {
        messages: {
          where: { visibility: MessageVisibility.PUBLIC },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!ticket) {
      throw new NotFoundException('TICKET_NOT_FOUND');
    }
    return ticket;
  }

  /** Atomic claim: the race condition lives entirely in this `updateMany`
   * WHERE clause (`assigneeId: null`) — Postgres guarantees only one
   * concurrent update sees a still-null assignee. No explicit transaction
   * or pessimistic lock needed for the claim itself. `updateMany` has no
   * `RETURNING`, so the ticket is re-read after confirming the claim. See
   * design.md "Reclamo atómico de tickets". */
  async claimTicket(id: string, agentId: string): Promise<Ticket> {
    const { count } = await this.prisma.ticket.updateMany({
      where: { id, assigneeId: null },
      data: { assigneeId: agentId, status: TicketStatus.OPEN },
    });
    if (count === 0) {
      throw new ConflictException('TICKET_ALREADY_CLAIMED');
    }

    return this.prisma.$transaction(async (tx) => {
      const ticket = await tx.ticket.findUniqueOrThrow({ where: { id } });
      await tx.ticketEvent.create({
        data: {
          ticketId: id,
          type: TicketEventType.ASSIGNED,
          actorAgentId: agentId,
        },
      });
      return ticket;
    });
  }

  async updateStatus(
    id: string,
    next: TicketStatus,
    agentId: string,
  ): Promise<Ticket> {
    return this.prisma.$transaction(async (tx) => {
      const ticket = await tx.ticket.findUnique({ where: { id } });
      if (!ticket) {
        throw new NotFoundException('TICKET_NOT_FOUND');
      }
      // Validated (and thrown) BEFORE any write — an invalid transition
      // must leave the ticket's status untouched.
      assertValidTransition(ticket.status, next);

      const updated = await tx.ticket.update({
        where: { id },
        data: { status: next },
      });
      await tx.ticketEvent.create({
        data: {
          ticketId: id,
          type: TicketEventType.STATUS_CHANGED,
          actorAgentId: agentId,
          payload: { from: ticket.status, to: next },
        },
      });
      return updated;
    });
  }

  async addMessage(
    id: string,
    dto: CreateMessageDto,
    agentId: string,
  ): Promise<Message> {
    return this.prisma.$transaction(async (tx) => {
      const ticket = await tx.ticket.findUnique({ where: { id } });
      if (!ticket) {
        throw new NotFoundException('TICKET_NOT_FOUND');
      }

      const message = await tx.message.create({
        data: {
          ticketId: id,
          body: dto.body,
          visibility: dto.visibility ?? MessageVisibility.PUBLIC,
          authorAgentId: agentId,
        },
      });
      await tx.ticketEvent.create({
        data: {
          ticketId: id,
          type: TicketEventType.MESSAGE_ADDED,
          actorAgentId: agentId,
        },
      });
      return message;
    });
  }
}
