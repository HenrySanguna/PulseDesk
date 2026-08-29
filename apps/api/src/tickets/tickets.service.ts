import {
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import type { Message, Prisma, Ticket } from '@pulsedesk/db';
import {
  MessageVisibility,
  PrismaService,
  SlaClockKind,
  TicketEventType,
  TicketPriority,
  TicketStatus,
} from '@pulsedesk/db';
import {
  AssignmentQueueService,
  type AssignmentQueuePort,
} from '../sla/assignment-queue.service.js';
import { SlaClockService, type SlaClockPort } from '../sla/sla-clock.service.js';
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
  constructor(
    private readonly prisma: PrismaService,
    @Inject(AssignmentQueueService)
    private readonly assignmentQueue: AssignmentQueuePort,
    @Inject(SlaClockService)
    private readonly slaClocks: SlaClockPort,
  ) {}

  /** Every new ticket is unassigned (`CreateTicketDto` never accepts an
   * `assigneeId`), so creation always enqueues an auto-assignment attempt —
   * the exact trigger design.md names for the `assignment` queue
   * ("disparado al crear un ticket sin agente preasignado"). Enqueued after
   * the DB transaction commits, not inside it: a Valkey hiccup must not
   * roll back a successfully created ticket, and the round-robin consumer
   * re-reads `assigneeId` before acting either way (safe to skip once and
   * pick the ticket up later via a manual claim instead).
   *
   * Every priority is seeded with exactly one `SlaPolicy` row (see
   * libs/db/prisma/migrations/<...>_seed_sla_policies) — the lookup and
   * `slaPolicyId` write happen inside the same transaction as ticket
   * creation, so a missing policy (a genuine data-integrity bug, not a user
   * error) rolls the whole creation back instead of leaving an
   * SLA-less ticket. Both clocks start together right after commit — an
   * explicit product decision (04-add-sla-jobs "Definición de terminado"),
   * not staggered. `SlaClockService.start()` does its own Prisma write plus
   * a BullMQ enqueue, so — like `enqueueAutoAssign` — it can't participate
   * in the transaction above and runs after it commits. */
  async createTicket(dto: CreateTicketDto): Promise<Ticket> {
    const priority = dto.priority ?? TicketPriority.NORMAL;
    const { ticket, policy } = await this.prisma.$transaction(async (tx) => {
      const created = await tx.ticket.create({
        data: { customerId: dto.customerId, subject: dto.subject, priority },
      });
      await tx.ticketEvent.create({
        data: { ticketId: created.id, type: TicketEventType.CREATED },
      });

      const foundPolicy = await tx.slaPolicy.findUnique({ where: { priority } });
      if (!foundPolicy) {
        throw new InternalServerErrorException(
          `SLA_POLICY_NOT_FOUND: no SlaPolicy configured for priority ${priority}`,
        );
      }

      const withPolicy = await tx.ticket.update({
        where: { id: created.id },
        data: { slaPolicyId: foundPolicy.id },
      });
      return { ticket: withPolicy, policy: foundPolicy };
    });

    await this.slaClocks.start(
      ticket.id,
      SlaClockKind.FIRST_RESPONSE,
      policy.firstResponseMinutes,
    );
    await this.slaClocks.start(
      ticket.id,
      SlaClockKind.RESOLUTION,
      policy.resolutionMinutes,
    );
    await this.assignmentQueue.enqueueAutoAssign(ticket.id);
    return ticket;
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

  /** SLA side effects live in `applySlaTransition`, run AFTER the status
   * transaction commits — see design.md/tasks.md "Definición de terminado"
   * (industry-standard helpdesk SLA behavior: pause while waiting on the
   * customer, complete on resolution, reactivate the same clock on
   * reopen). */
  async updateStatus(
    id: string,
    next: TicketStatus,
    agentId: string,
  ): Promise<Ticket> {
    const { ticket, from } = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.ticket.findUnique({ where: { id } });
      if (!existing) {
        throw new NotFoundException('TICKET_NOT_FOUND');
      }
      // Validated (and thrown) BEFORE any write — an invalid transition
      // must leave the ticket's status untouched.
      assertValidTransition(existing.status, next);

      const updated = await tx.ticket.update({
        where: { id },
        data: { status: next },
      });
      await tx.ticketEvent.create({
        data: {
          ticketId: id,
          type: TicketEventType.STATUS_CHANGED,
          actorAgentId: agentId,
          payload: { from: existing.status, to: next },
        },
      });
      return { ticket: updated, from: existing.status };
    });

    await this.applySlaTransition(id, from, next);
    return ticket;
  }

  /** Maps a validated ticket status transition to its SLA clock side
   * effect — Zendesk/Freshdesk/Jira-Service-Management-style helpdesk SLA
   * behavior. `pause`/`resume` already operate ticket-wide across every
   * active/paused clock (no `kind` parameter), so OPEN<->PENDING affects
   * both FIRST_RESPONSE and RESOLUTION uniformly. `-> RESOLVED` is only
   * reachable from OPEN or PENDING (see `ticket-state-machine.ts`), so no
   * extra `from` check is needed there. `-> CLOSED` (only reachable from
   * RESOLVED) needs no clock action — the ticket was already completed by
   * the prior RESOLVED transition. Reopen only reactivates RESOLUTION: the
   * FIRST_RESPONSE clock stays completed forever once a first reply has
   * happened. */
  private async applySlaTransition(
    ticketId: string,
    from: TicketStatus,
    to: TicketStatus,
  ): Promise<void> {
    if (from === TicketStatus.OPEN && to === TicketStatus.PENDING) {
      await this.slaClocks.pause(ticketId);
      return;
    }
    if (from === TicketStatus.PENDING && to === TicketStatus.OPEN) {
      await this.slaClocks.resume(ticketId);
      return;
    }
    if (to === TicketStatus.RESOLVED) {
      await this.slaClocks.complete(ticketId, SlaClockKind.RESOLUTION);
      return;
    }
    if (
      to === TicketStatus.OPEN &&
      (from === TicketStatus.RESOLVED || from === TicketStatus.CLOSED)
    ) {
      await this.slaClocks.reactivate(ticketId, SlaClockKind.RESOLUTION);
    }
  }

  /** `addMessage` is only reachable via the agent-guarded
   * `POST /tickets/:id/messages` route (see `tickets.controller.ts`) —
   * every message created here is agent-authored, so the first
   * PUBLIC-visibility one completes the FIRST_RESPONSE clock.
   * `SlaClockService.complete()` is idempotent (no-ops once `completedAt`
   * is set), so calling it on every PUBLIC message is simpler and equally
   * correct as separately tracking "is this the first one". */
  async addMessage(
    id: string,
    dto: CreateMessageDto,
    agentId: string,
  ): Promise<Message> {
    const visibility = dto.visibility ?? MessageVisibility.PUBLIC;
    const message = await this.prisma.$transaction(async (tx) => {
      const ticket = await tx.ticket.findUnique({ where: { id } });
      if (!ticket) {
        throw new NotFoundException('TICKET_NOT_FOUND');
      }

      const created = await tx.message.create({
        data: {
          ticketId: id,
          body: dto.body,
          visibility,
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
      return created;
    });

    if (visibility === MessageVisibility.PUBLIC) {
      await this.slaClocks.complete(id, SlaClockKind.FIRST_RESPONSE);
    }
    return message;
  }
}
