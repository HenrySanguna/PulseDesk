import { describe, expect, it } from 'vitest';
import { TicketStatus, getValidNextStatuses } from './tickets.js';

describe('getValidNextStatuses', () => {
  it('allows NEW -> OPEN only', () => {
    expect(getValidNextStatuses(TicketStatus.NEW)).toEqual([
      TicketStatus.OPEN,
    ]);
  });

  it('allows OPEN -> PENDING or RESOLVED', () => {
    expect(new Set(getValidNextStatuses(TicketStatus.OPEN))).toEqual(
      new Set([TicketStatus.PENDING, TicketStatus.RESOLVED]),
    );
  });

  it('allows PENDING -> OPEN or RESOLVED', () => {
    expect(new Set(getValidNextStatuses(TicketStatus.PENDING))).toEqual(
      new Set([TicketStatus.OPEN, TicketStatus.RESOLVED]),
    );
  });

  it('allows RESOLVED -> CLOSED or OPEN (reopening)', () => {
    expect(new Set(getValidNextStatuses(TicketStatus.RESOLVED))).toEqual(
      new Set([TicketStatus.CLOSED, TicketStatus.OPEN]),
    );
  });

  it('allows CLOSED -> OPEN only (reopening)', () => {
    expect(getValidNextStatuses(TicketStatus.CLOSED)).toEqual([
      TicketStatus.OPEN,
    ]);
  });

  it('rejects every other move implicitly by omission', () => {
    // Every status is covered above; this test documents the full matrix
    // has exactly 5 entries (one per TicketStatus), mirroring
    // ticket-state-machine.spec.ts's "everything else is rejected" test.
    expect(Object.values(TicketStatus)).toHaveLength(5);
  });
});
