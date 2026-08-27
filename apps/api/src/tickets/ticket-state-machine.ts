import { UnprocessableEntityException } from '@nestjs/common';
import { TicketStatus } from '@pulsedesk/db';

/**
 * Explicit ticket lifecycle: new -> open -> pending -> resolved -> closed,
 * with reopening from RESOLVED or CLOSED back to OPEN. Declared as an
 * adjacency map — every valid move is spelled out, anything not listed is
 * rejected — per
 * openspec/changes/03-add-ticket-queue/specs/ticket-queue/spec.md
 * ("Máquina de estados del ticket").
 */
const TICKET_TRANSITIONS: Record<TicketStatus, ReadonlySet<TicketStatus>> = {
  [TicketStatus.NEW]: new Set([TicketStatus.OPEN]),
  [TicketStatus.OPEN]: new Set([TicketStatus.PENDING, TicketStatus.RESOLVED]),
  [TicketStatus.PENDING]: new Set([TicketStatus.OPEN, TicketStatus.RESOLVED]),
  [TicketStatus.RESOLVED]: new Set([TicketStatus.CLOSED, TicketStatus.OPEN]),
  [TicketStatus.CLOSED]: new Set([TicketStatus.OPEN]),
};

export function canTransition(from: TicketStatus, to: TicketStatus): boolean {
  return TICKET_TRANSITIONS[from].has(to);
}

export function assertValidTransition(
  from: TicketStatus,
  to: TicketStatus,
): void {
  if (!canTransition(from, to)) {
    throw new UnprocessableEntityException(
      `TICKET_INVALID_TRANSITION: cannot move from ${from} to ${to}`,
    );
  }
}
