import { Injectable } from '@nestjs/common';
import type { BusinessCalendar, BusinessWindow } from '@pulsedesk/sla-engine';
import { PrismaService } from '@pulsedesk/db';

/**
 * Default calendar used when no `BusinessCalendar` row exists yet (fresh
 * database, no admin tooling has created one — see sla.prisma). Matches the
 * convention already used by `libs/sla-engine`'s own test fixtures
 * (Europe/Madrid, Mon-Fri business hours) so behavior is predictable before
 * a real calendar is configured.
 */
export const DEFAULT_BUSINESS_CALENDAR: BusinessCalendar = {
  timezone: 'Europe/Madrid',
  windows: [1, 2, 3, 4, 5].map((day) => ({ day: day as BusinessWindow['day'], from: '09:00', to: '18:00' })),
  holidays: [],
};

/**
 * Loads the persisted `BusinessCalendar` row (task 1.2 — "persistencia del
 * tipo que consume libs/sla-engine") and maps it to the exact structural
 * type `businessMinutesBetween`/`addBusinessMinutes` accept, so
 * `SlaClockService` never touches Prisma's row shape directly.
 */
@Injectable()
export class BusinessCalendarRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getActive(): Promise<BusinessCalendar> {
    const row = await this.prisma.businessCalendar.findFirst({
      orderBy: { updatedAt: 'desc' },
    });
    if (!row) {
      return DEFAULT_BUSINESS_CALENDAR;
    }
    return {
      timezone: row.timezone,
      windows: row.windows as unknown as BusinessWindow[],
      holidays: row.holidays,
    };
  }
}
