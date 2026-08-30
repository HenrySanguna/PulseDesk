import { TicketStatus } from '@pulsedesk/db';

/**
 * Per-ticket mirror of `libs/db/src/queries/dashboard-snapshot.query.ts`'s
 * `atRiskCount` SQL formula (06-add-polish tasks.md 2.2): a still-open
 * ticket that has already burned 80% of its SLA policy's resolution window,
 * measured from `createdAt` (not from a live `SlaClock.dueAt` — same
 * documented approximation the dashboard aggregate already uses, see that
 * file's doc comment).
 *
 * Deliberately a SEPARATE implementation from that raw-SQL `COUNT(...)
 * FILTER (...)` aggregate, not a shared one: the dashboard needs one
 * aggregate count computed entirely in Postgres, this needs a per-row
 * boolean computed in TS against already-fetched `Ticket` rows — two
 * different call-site shapes for the exact same threshold rule. Both must
 * be updated together if that 80% threshold or the eligible-status set ever
 * changes.
 */
export function isTicketAtRisk(
  ticket: { status: TicketStatus; createdAt: Date },
  resolutionMinutes: number | null | undefined,
  now: Date = new Date(),
): boolean {
  if (resolutionMinutes == null) {
    return false;
  }
  if (
    ticket.status !== TicketStatus.NEW &&
    ticket.status !== TicketStatus.OPEN &&
    ticket.status !== TicketStatus.PENDING
  ) {
    return false;
  }
  const thresholdMs = resolutionMinutes * 60_000 * 0.8;
  return ticket.createdAt.getTime() + thresholdMs < now.getTime();
}
