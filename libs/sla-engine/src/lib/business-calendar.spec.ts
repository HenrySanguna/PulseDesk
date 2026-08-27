import { describe, expect, it } from 'vitest';
import { validateBusinessCalendar, type BusinessCalendar } from './business-calendar.js';

const validCalendar: BusinessCalendar = {
  timezone: 'Europe/Madrid',
  windows: [
    { day: 1, from: '09:00', to: '18:00' },
    { day: 2, from: '09:00', to: '18:00' },
  ],
  holidays: ['2026-12-25'],
};

describe('validateBusinessCalendar', () => {
  it('does not throw for a well-formed calendar', () => {
    expect(() => validateBusinessCalendar(validCalendar)).not.toThrow();
  });

  it('throws for an unrecognized IANA timezone', () => {
    const calendar: BusinessCalendar = { ...validCalendar, timezone: 'Not/AZone' };
    expect(() => validateBusinessCalendar(calendar)).toThrow(/timezone/i);
  });

  it('throws for a malformed window time string', () => {
    const calendar: BusinessCalendar = {
      ...validCalendar,
      windows: [{ day: 1, from: '25:00', to: '18:00' }],
    };
    expect(() => validateBusinessCalendar(calendar)).toThrow(/Invalid business window time/);
  });

  it('throws when a window "from" is not before its "to"', () => {
    const calendar: BusinessCalendar = {
      ...validCalendar,
      windows: [{ day: 1, from: '18:00', to: '09:00' }],
    };
    expect(() => validateBusinessCalendar(calendar)).toThrow(/must be before/);
  });

  it('does not throw for two non-overlapping windows on the same day (split lunch break)', () => {
    const calendar: BusinessCalendar = {
      ...validCalendar,
      windows: [
        { day: 1, from: '09:00', to: '13:00' },
        { day: 1, from: '14:00', to: '18:00' },
      ],
    };
    expect(() => validateBusinessCalendar(calendar)).not.toThrow();
  });

  it('throws when two windows on the same day overlap', () => {
    const calendar: BusinessCalendar = {
      ...validCalendar,
      windows: [
        { day: 1, from: '09:00', to: '14:00' },
        { day: 1, from: '13:00', to: '18:00' },
      ],
    };
    expect(() => validateBusinessCalendar(calendar)).toThrow(/must not overlap/);
  });
});
