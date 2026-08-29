import type { BusinessWindow } from '@pulsedesk/sla-engine';
import type { PrismaService } from '@pulsedesk/db';

/** Never exported from any public barrel — only for integration tests in
 * this directory, same convention as `libs/db/src/queries/test-real-prisma.ts`. */

const ALWAYS_OPEN_WINDOWS: BusinessWindow[] = [0, 1, 2, 3, 4, 5, 6].map((day) => ({
  day: day as BusinessWindow['day'],
  from: '00:00',
  to: '23:59',
}));

/**
 * Ensures a `BusinessCalendar` row covering all 7 days/all hours exists, so
 * `BusinessCalendarRepository.getActive()` returns deterministic,
 * always-open business hours regardless of the real wall-clock day/hour the
 * test suite happens to run at — every test in this directory needs
 * `businessMinutesBetween`/`addBusinessMinutes` to behave like plain
 * wall-clock arithmetic, not depend on Mon-Fri 09-18 Madrid actually being
 * "now".
 *
 * Idempotent (reuses the row if a previous run already created one) so
 * repeated test runs don't accumulate rows — `getActive()` picks the most
 * recently updated `BusinessCalendar`, and this is the only place in the
 * codebase that creates one, so it stays authoritative.
 */
export async function ensureAlwaysOpenCalendar(
  prisma: Pick<PrismaService, 'businessCalendar'>,
): Promise<void> {
  const existing = await prisma.businessCalendar.findFirst({ where: { timezone: 'UTC' } });
  if (existing) {
    return;
  }
  await prisma.businessCalendar.create({
    data: { timezone: 'UTC', windows: ALWAYS_OPEN_WINDOWS, holidays: [] },
  });
}

/** Seeds a bare customer + ticket for tests that only need a valid
 * `ticketId` to attach an `SlaClock` to — mirrors
 * `apps/api/src/tickets/tickets.integration.spec.ts`'s seeding style. */
export async function seedTicketForSla(
  prisma: Pick<PrismaService, 'customer' | 'ticket'>,
  suffix: string,
): Promise<{ customerId: string; ticketId: string }> {
  const customerId = crypto.randomUUID();
  await prisma.customer.create({ data: { id: customerId, sessionId: `session-${suffix}` } });
  const ticket = await prisma.ticket.create({
    data: { subject: `SLA test ticket ${suffix}`, customerId },
  });
  return { customerId, ticketId: ticket.id };
}
