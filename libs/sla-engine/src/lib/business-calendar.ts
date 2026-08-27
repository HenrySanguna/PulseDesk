import { DateTime } from 'luxon';

/**
 * Day of week, matching `Date#getDay()` (0 = Sunday, ..., 6 = Saturday).
 */
export type WeekDay = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/**
 * A single business window on a given day of the week. `from`/`to` are
 * wall-clock times in `"HH:mm"` (24h) format, interpreted in the owning
 * calendar's `timezone`. `from` is inclusive, `to` is exclusive.
 */
export interface BusinessWindow {
  day: WeekDay;
  from: string;
  to: string;
}

/**
 * Defines the recurring business hours used to compute SLA due dates.
 * A pure, serializable data object — no I/O, no framework dependency.
 */
export interface BusinessCalendar {
  /** IANA timezone identifier, e.g. "Europe/Madrid". */
  timezone: string;
  windows: BusinessWindow[];
  /** ISO dates ("YYYY-MM-DD") excluded entirely, even if they fall on a business weekday. */
  holidays: string[];
}

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

function parseTimeToMinutes(value: string): number {
  const match = TIME_PATTERN.exec(value);
  if (!match) {
    throw new Error(`Invalid business window time "${value}"; expected 24h "HH:mm"`);
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

/**
 * Validates the shape of a {@link BusinessCalendar}: a real IANA timezone,
 * well-formed `"HH:mm"` times with `from < to`, and non-overlapping windows
 * within the same day. Throws on the first violation found.
 */
export function validateBusinessCalendar(calendar: BusinessCalendar): void {
  if (!DateTime.local().setZone(calendar.timezone).isValid) {
    throw new Error(`Invalid IANA timezone "${calendar.timezone}"`);
  }

  const windowsByDay = new Map<WeekDay, Array<{ from: number; to: number }>>();
  for (const window of calendar.windows) {
    const from = parseTimeToMinutes(window.from);
    const to = parseTimeToMinutes(window.to);
    if (from >= to) {
      throw new Error(
        `Business window "from" (${window.from}) must be before "to" (${window.to})`,
      );
    }
    const dayWindows = windowsByDay.get(window.day) ?? [];
    dayWindows.push({ from, to });
    windowsByDay.set(window.day, dayWindows);
  }

  for (const dayWindows of windowsByDay.values()) {
    const sorted = [...dayWindows].sort((a, b) => a.from - b.from);
    for (let i = 1; i < sorted.length; i += 1) {
      if (sorted[i].from < sorted[i - 1].to) {
        throw new Error('Business windows on the same day must not overlap');
      }
    }
  }
}
