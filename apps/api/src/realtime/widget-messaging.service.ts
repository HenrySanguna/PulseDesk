import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Message } from '@pulsedesk/db';
import { MessageVisibility, Prisma, PrismaService } from '@pulsedesk/db';
import { TicketsService } from '../tickets/tickets.service.js';

export interface SendWidgetMessageInput {
  body: string;
  clientMessageId: string;
}

/**
 * Bridges the widget's `conversationId` (JWT-scoped, `02-add-dual-auth`) to
 * the ticket/message domain (`03-add-ticket-queue`) so a customer's chat
 * message over `ws` becomes a real `Message` row. See
 * `openspec/changes/05-add-realtime-hybrid/tasks.md` "Nota de arquitectura:
 * puente Conversation-Ticket" for why this bridge exists — `Conversation`
 * (02) and `Ticket` (03) were never linked before this change.
 */
@Injectable()
export class WidgetMessagingService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(TicketsService) private readonly tickets: TicketsService,
  ) {}

  /** Returns the ticket backing `conversationId`, lazily creating one (via
   * the SAME `TicketsService.createTicket` an agent-created ticket goes
   * through — same SLA/priority rules, no separate code path) on the
   * conversation's first message. Race-safe the same way
   * `TicketsService.claimTicket` is: an atomic `updateMany` guarded by
   * `ticketId: null` decides the winner if two first-messages land
   * concurrently on the same conversation.
   *
   * Trade-off: the LOSER of that race has already created a real `Ticket`
   * (with SLA clocks started, an auto-assignment enqueued) before
   * discovering it lost — that ticket is not deleted, it's simply left
   * unlinked from any conversation. This is deliberately accepted rather
   * than adding transactional/locking complexity for what is a narrow race
   * (two tabs of the same widget conversation sending their very first
   * message at the same instant) with a merely wasteful, not corrupting,
   * outcome — an agent can still see and close the orphaned ticket
   * manually. */
  async getOrCreateTicketId(conversationId: string, customerId: string): Promise<string> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });
    if (!conversation) {
      throw new NotFoundException('CONVERSATION_NOT_FOUND');
    }
    if (conversation.ticketId) {
      return conversation.ticketId;
    }

    const ticket = await this.tickets.createTicket({
      customerId,
      subject: 'Widget conversation',
    });
    const { count } = await this.prisma.conversation.updateMany({
      where: { id: conversationId, ticketId: null },
      data: { ticketId: ticket.id },
    });
    if (count === 1) {
      return ticket.id;
    }
    const fresh = await this.prisma.conversation.findUniqueOrThrow({
      where: { id: conversationId },
    });
    // Another concurrent call already won the link — `fresh.ticketId` is
    // guaranteed non-null here since a conversation is only ever linked
    // once and never unlinked.
    return fresh.ticketId as string;
  }

  /** Persists a customer-authored message, idempotent on
   * `[ticketId, clientMessageId]` — the SAME unique constraint
   * `03-add-ticket-queue` added, reused as-is (spec "Idempotencia de
   * mensajes reenviados por reconexión"). A resend after a reconnect hits
   * the unique-constraint conflict and this returns the ALREADY-persisted
   * message instead of erroring — no second dedup table. */
  async sendMessage(
    conversationId: string,
    customerId: string,
    dto: SendWidgetMessageInput,
  ): Promise<Message> {
    const ticketId = await this.getOrCreateTicketId(conversationId, customerId);
    try {
      return await this.prisma.message.create({
        data: {
          ticketId,
          body: dto.body,
          clientMessageId: dto.clientMessageId,
          visibility: MessageVisibility.PUBLIC,
          authorAgentId: null,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const existing = await this.prisma.message.findUnique({
          where: { ticketId_clientMessageId: { ticketId, clientMessageId: dto.clientMessageId } },
        });
        if (existing) {
          return existing;
        }
      }
      throw err;
    }
  }

  /** Reverse lookup for broadcasting an agent-authored reply
   * (`POST /tickets/:id/messages`, unchanged REST path) to the widget's
   * `ws` room — `null` for a ticket with no linked widget conversation
   * (an agent-created ticket, most tickets in the seed data / test suite). */
  async findConversationIdForTicket(ticketId: string): Promise<string | null> {
    const conversation = await this.prisma.conversation.findUnique({ where: { ticketId } });
    return conversation?.id ?? null;
  }
}
