import { describe, expect, it } from 'vitest';
import { TicketStatus } from '@pulsedesk/db';
import { assertValidTransition, canTransition } from './ticket-state-machine.js';

const ALL_STATUSES = Object.values(TicketStatus);

const VALID_TRANSITIONS: [TicketStatus, TicketStatus][] = [
  [TicketStatus.NEW, TicketStatus.OPEN],
  [TicketStatus.OPEN, TicketStatus.PENDING],
  [TicketStatus.OPEN, TicketStatus.RESOLVED],
  [TicketStatus.PENDING, TicketStatus.OPEN],
  [TicketStatus.PENDING, TicketStatus.RESOLVED],
  [TicketStatus.RESOLVED, TicketStatus.CLOSED],
  [TicketStatus.RESOLVED, TicketStatus.OPEN],
  [TicketStatus.CLOSED, TicketStatus.OPEN],
];

describe('ticket state machine', () => {
  it.each(VALID_TRANSITIONS)('allows %s -> %s', (from, to) => {
    expect(canTransition(from, to)).toBe(true);
    expect(() => assertValidTransition(from, to)).not.toThrow();
  });

  it('rejects every transition not explicitly listed as valid, including new -> closed', () => {
    const validPairs = new Set(
      VALID_TRANSITIONS.map(([from, to]) => `${from}->${to}`),
    );
    const rejectedPairs: string[] = [];

    for (const from of ALL_STATUSES) {
      for (const to of ALL_STATUSES) {
        if (from === to) continue;
        const pair = `${from}->${to}`;
        if (validPairs.has(pair)) continue;

        expect(canTransition(from, to)).toBe(false);
        expect(() => assertValidTransition(from, to)).toThrow(
          /TICKET_INVALID_TRANSITION/,
        );
        rejectedPairs.push(pair);
      }
    }

    expect(rejectedPairs).toContain(
      `${TicketStatus.NEW}->${TicketStatus.CLOSED}`,
    );
  });
});
