import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import type { BusinessCalendar } from './business-calendar.js';
import { addBusinessMinutes, businessMinutesBetween } from './sla-engine.js';

/** Monday-Friday, 09:00-18:00, UTC, no holidays. Used across most scenarios below. */
const STANDARD_CALENDAR: BusinessCalendar = {
  timezone: 'UTC',
  windows: [1, 2, 3, 4, 5].map((day) => ({ day: day as 1 | 2 | 3 | 4 | 5, from: '09:00', to: '18:00' })),
  holidays: [],
};

describe('addBusinessMinutes — SLA due-date scenarios (tasks.md §3)', () => {
  it('3.1 lands within the same business day when the SLA fits inside the remaining hours', () => {
    const from = new Date('2026-01-06T10:00:00Z'); // Tuesday
    const due = addBusinessMinutes(from, 120, STANDARD_CALENDAR);
    expect(due.toISOString()).toBe('2026-01-06T12:00:00.000Z');
  });

  it('3.2 rolls the due date past the night into the next business day when the SLA crosses closing time', () => {
    const from = new Date('2026-01-05T17:00:00Z'); // Monday, 60 min left before 18:00 close
    const due = addBusinessMinutes(from, 90, STANDARD_CALENDAR);
    // 60 min Monday 17:00-18:00 + 30 min Tuesday 09:00-09:30 = 90 min.
    expect(due.toISOString()).toBe('2026-01-06T09:30:00.000Z');
  });

  it('3.3 rolls the due date past the weekend into the next business Monday when the SLA crosses Friday close', () => {
    const from = new Date('2026-01-09T17:00:00Z'); // Friday
    const due = addBusinessMinutes(from, 240, STANDARD_CALENDAR);
    // 60 min Friday 17:00-18:00 + 180 min Monday 09:00-12:00 = 240 min. Sat/Sun contribute 0.
    expect(due.toISOString()).toBe('2026-01-12T12:00:00.000Z');
  });

  it('3.4 skips a holiday entirely when the ticket opens on a day marked as a holiday', () => {
    const calendar: BusinessCalendar = { ...STANDARD_CALENDAR, holidays: ['2026-12-25'] };
    const from = new Date('2026-12-25T10:00:00Z'); // Friday, marked as a holiday
    const due = addBusinessMinutes(from, 30, calendar);
    // Dec 25 (holiday) and the following Sat/Sun are excluded -> next window is Monday Dec 28.
    expect(due.toISOString()).toBe('2026-12-28T09:30:00.000Z');
  });

  it('3.5 starts the SLA clock at the next opening time for tickets opened before opening or after closing', () => {
    const beforeOpening = addBusinessMinutes(new Date('2026-01-06T07:00:00Z'), 30, STANDARD_CALENDAR);
    expect(beforeOpening.toISOString()).toBe('2026-01-06T09:30:00.000Z');

    const afterClosing = addBusinessMinutes(new Date('2026-01-06T20:00:00Z'), 30, STANDARD_CALENDAR);
    expect(afterClosing.toISOString()).toBe('2026-01-07T09:30:00.000Z');
  });

  it('3.6 keeps correct wall-clock hours across a DST transition inside the calculation window', () => {
    const calendar: BusinessCalendar = { timezone: 'Europe/Madrid', windows: STANDARD_CALENDAR.windows, holidays: [] };
    // Friday 2026-03-27 17:00 local (CET, UTC+01:00). The DST transition to
    // CEST (UTC+02:00) happens on Sunday 2026-03-29, inside the Fri->Mon gap.
    const from = DateTime.fromObject(
      { year: 2026, month: 3, day: 27, hour: 17, minute: 0 },
      { zone: 'Europe/Madrid' },
    ).toJSDate();
    const due = addBusinessMinutes(from, 240, calendar);
    // 60 min Friday 17:00-18:00 (CET) + 180 min Monday 09:00-12:00 (CEST) = 240 min.
    // Wall-clock result stays 12:00 local even though the UTC offset shifted by
    // an hour across the transition; a naive fixed-offset implementation would
    // have produced 11:00Z instead of the correct 10:00Z.
    const dueLocal = DateTime.fromJSDate(due, { zone: 'Europe/Madrid' });
    expect(dueLocal.toFormat('yyyy-LL-dd HH:mm')).toBe('2026-03-30 12:00');
    expect(due.toISOString()).toBe('2026-03-30T10:00:00.000Z');
  });

  it('3.7 resolves a 0-minute SLA to the current instant in business hours, or to the next opening outside them', () => {
    const withinHours = addBusinessMinutes(new Date('2026-01-06T10:00:00Z'), 0, STANDARD_CALENDAR);
    expect(withinHours.toISOString()).toBe('2026-01-06T10:00:00.000Z');

    const outsideHours = addBusinessMinutes(new Date('2026-01-06T20:00:00Z'), 0, STANDARD_CALENDAR);
    expect(outsideHours.toISOString()).toBe('2026-01-07T09:00:00.000Z');
  });

  it('3.8 computes a due date correctly for an SLA longer than a full business week', () => {
    // By hand: 540 business minutes/day, Mon-Fri. Starting Monday 2026-01-05 09:00:
    // Mon+Tue+Wed+Thu+Fri (5 x 540 = 2700) consumes the first week exactly,
    // landing at Friday 2026-01-09 18:00 -> next window Monday 2026-01-12 09:00.
    // Remaining 4500 - 2700 = 1800 minutes: Mon+Tue+Wed (3 x 540 = 1620) leaves
    // 180 minutes, consumed on Thursday 2026-01-15 from 09:00 -> 12:00.
    const from = new Date('2026-01-05T09:00:00Z'); // Monday, exactly at opening
    const due = addBusinessMinutes(from, 4500, STANDARD_CALENDAR);
    expect(due.toISOString()).toBe('2026-01-15T12:00:00.000Z');
  });

  it('3.9 matches the manual calculation: Friday 17:50 + 4 business-hour SLA (9-18 day) lands Monday 12:50', () => {
    // By hand: Friday 17:50 -> 18:00 close = 10 minutes consumed, 230 minutes
    // left. Saturday/Sunday contribute 0. Monday opens at 09:00; 230 minutes
    // later is 09:00 + 3h50m = 12:50. Total consumed: 10 + 230 = 240 min = 4h. ✓
    const from = new Date('2026-01-09T17:50:00Z'); // Friday
    const due = addBusinessMinutes(from, 240, STANDARD_CALENDAR);
    expect(due.toISOString()).toBe('2026-01-12T12:50:00.000Z');
  });
});

describe('addBusinessMinutes — multi-window business days', () => {
  it('jumps across a same-day gap (e.g. a lunch break) when a day has more than one window', () => {
    const calendar: BusinessCalendar = {
      timezone: 'UTC',
      windows: [
        { day: 1, from: '09:00', to: '12:00' },
        { day: 1, from: '13:00', to: '18:00' },
      ],
      holidays: [],
    };
    const from = new Date('2026-01-05T11:00:00Z'); // Monday, 1h left before the lunch break
    const due = addBusinessMinutes(from, 90, calendar);
    // 60 min 11:00-12:00 + 30 min 13:00-13:30 (lunch break 12:00-13:00 excluded) = 90 min.
    expect(due.toISOString()).toBe('2026-01-05T13:30:00.000Z');
  });
});

describe('addBusinessMinutes — input validation', () => {
  it('throws for a negative minute count', () => {
    expect(() =>
      addBusinessMinutes(new Date('2026-01-06T10:00:00Z'), -1, STANDARD_CALENDAR),
    ).toThrow(/negative/);
  });

  it('throws when the calendar has no active business windows at all', () => {
    const calendar: BusinessCalendar = { timezone: 'UTC', windows: [], holidays: [] };
    expect(() => addBusinessMinutes(new Date('2026-01-06T10:00:00Z'), 30, calendar)).toThrow(
      /No business window found/,
    );
  });
});

describe('businessMinutesBetween', () => {
  it('counts elapsed business minutes within the same business day', () => {
    const a = new Date('2026-01-06T10:00:00Z');
    const b = new Date('2026-01-06T12:00:00Z');
    expect(businessMinutesBetween(a, b, STANDARD_CALENDAR)).toBe(120);
  });

  it('stops counting at closing time when the range crosses overnight, before the next opening', () => {
    const a = new Date('2026-01-05T17:00:00Z'); // Monday
    const b = new Date('2026-01-06T08:00:00Z'); // Tuesday, before opening
    expect(businessMinutesBetween(a, b, STANDARD_CALENDAR)).toBe(60);
  });

  it('excludes the weekend entirely when the range spans Friday close to Monday before opening', () => {
    const a = new Date('2026-01-09T17:00:00Z'); // Friday
    const b = new Date('2026-01-12T08:00:00Z'); // Monday, before opening
    expect(businessMinutesBetween(a, b, STANDARD_CALENDAR)).toBe(60);
  });

  it('excludes a holiday even when it falls on what would otherwise be a business weekday', () => {
    const calendar: BusinessCalendar = { ...STANDARD_CALENDAR, holidays: ['2026-12-25'] };
    const a = new Date('2026-12-24T17:00:00Z'); // Thursday
    const b = new Date('2026-12-26T10:00:00Z'); // Saturday (non-business day)
    expect(businessMinutesBetween(a, b, calendar)).toBe(60);
  });

  it('throws when the start instant is after the end instant', () => {
    const a = new Date('2026-01-06T12:00:00Z');
    const b = new Date('2026-01-06T10:00:00Z');
    expect(() => businessMinutesBetween(a, b, STANDARD_CALENDAR)).toThrow(/before or equal/);
  });
});
