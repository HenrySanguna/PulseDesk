import { DateTime } from 'luxon';
import {
  type BusinessCalendar,
  type WeekDay,
  validateBusinessCalendar,
} from './business-calendar.js';

/** The maximum number of calendar days to look ahead for the next business window. */
const MAX_LOOKAHEAD_DAYS = 370;

interface WindowBounds {
  start: DateTime;
  end: DateTime;
}

function toZonedDateTime(date: Date, timezone: string): DateTime {
  return DateTime.fromJSDate(date, { zone: timezone });
}

function isHoliday(day: DateTime, calendar: BusinessCalendar): boolean {
  return calendar.holidays.includes(day.toISODate() as string);
}

function setClockTime(day: DateTime, time: string): DateTime {
  const [hour, minute] = time.split(':').map(Number);
  return day.set({ hour, minute, second: 0, millisecond: 0 });
}

/** Business windows configured for `day`'s date, sorted by start time (empty on a holiday). */
function windowsForDay(day: DateTime, calendar: BusinessCalendar): WindowBounds[] {
  if (isHoliday(day, calendar)) {
    return [];
  }
  const weekday = (day.weekday % 7) as WeekDay;
  return calendar.windows
    .filter((window) => window.day === weekday)
    .map((window) => ({ start: setClockTime(day, window.from), end: setClockTime(day, window.to) }))
    .sort((a, b) => a.start.toMillis() - b.start.toMillis());
}

/** The business window containing `cursor` (`start <= cursor < end`), or `null` if outside business hours. */
function findWindowContaining(cursor: DateTime, calendar: BusinessCalendar): WindowBounds | null {
  const windows = windowsForDay(cursor, calendar);
  return windows.find((window) => cursor >= window.start && cursor < window.end) ?? null;
}

/**
 * The earliest business window whose start is at or after `cursor`, scanning
 * forward day by day. Bounded by {@link MAX_LOOKAHEAD_DAYS} so a calendar with
 * no windows at all fails fast instead of looping forever.
 */
function findNextWindow(cursor: DateTime, calendar: BusinessCalendar): WindowBounds {
  let day = cursor.startOf('day');
  for (let i = 0; i < MAX_LOOKAHEAD_DAYS; i += 1) {
    const candidate = windowsForDay(day, calendar).find((window) => window.start >= cursor);
    if (candidate) {
      return candidate;
    }
    day = day.plus({ days: 1 });
  }
  throw new Error(
    `No business window found within ${MAX_LOOKAHEAD_DAYS} days; the calendar may have no active windows`,
  );
}

/** The window containing `cursor`, or the next upcoming one if `cursor` is outside business hours. */
function locateWindow(cursor: DateTime, calendar: BusinessCalendar): WindowBounds {
  return findWindowContaining(cursor, calendar) ?? findNextWindow(cursor, calendar);
}

/**
 * Adds `minutes` of business time to `from`, jumping directly between the end
 * of one business window and the start of the next instead of iterating
 * minute by minute. Runs in O(windows crossed), not O(minutes).
 *
 * `minutes` may be 0: if `from` already falls inside a business window it is
 * returned unchanged, otherwise the start of the next window is returned.
 */
export function addBusinessMinutes(from: Date, minutes: number, calendar: BusinessCalendar): Date {
  if (minutes < 0) {
    throw new Error('addBusinessMinutes does not support negative minute counts');
  }
  validateBusinessCalendar(calendar);

  const start = toZonedDateTime(from, calendar.timezone);

  if (minutes === 0) {
    const currentWindow = findWindowContaining(start, calendar);
    return (currentWindow ? start : findNextWindow(start, calendar).start).toJSDate();
  }

  let cursor = start;
  let remaining = minutes;
  while (remaining > 0) {
    const window = locateWindow(cursor, calendar);
    cursor = window.start > cursor ? window.start : cursor;

    const availableMinutes = window.end.diff(cursor, 'minutes').minutes;
    if (remaining <= availableMinutes) {
      cursor = cursor.plus({ minutes: remaining });
      remaining = 0;
    } else {
      remaining -= availableMinutes;
      cursor = window.end;
    }
  }

  return cursor.toJSDate();
}

/**
 * Counts the business minutes elapsed between `a` and `b`, considering only
 * the windows and days defined in `calendar` and excluding holidays.
 * `a` must not be after `b`.
 */
export function businessMinutesBetween(a: Date, b: Date, calendar: BusinessCalendar): number {
  if (a > b) {
    throw new Error('businessMinutesBetween requires "a" to be before or equal to "b"');
  }
  validateBusinessCalendar(calendar);

  let cursor = toZonedDateTime(a, calendar.timezone);
  const end = toZonedDateTime(b, calendar.timezone);
  let total = 0;

  while (cursor < end) {
    const containing = findWindowContaining(cursor, calendar);
    if (containing) {
      const segmentEnd = containing.end < end ? containing.end : end;
      total += segmentEnd.diff(cursor, 'minutes').minutes;
      cursor = segmentEnd;
    } else {
      cursor = findNextWindow(cursor, calendar).start;
    }
  }

  return total;
}
