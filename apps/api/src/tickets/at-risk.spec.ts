import { describe, expect, it } from 'vitest';
import { TicketStatus } from '@pulsedesk/db';
import { isTicketAtRisk } from './at-risk.js';

const NOW = new Date('2026-01-01T12:00:00.000Z');

describe('isTicketAtRisk', () => {
  it('is false with no SLA policy resolution window', () => {
    expect(
      isTicketAtRisk({ status: TicketStatus.OPEN, createdAt: NOW }, null, NOW),
    ).toBe(false);
  });

  it('is false for a resolved/closed ticket even past the 80% threshold', () => {
    const createdAt = new Date(NOW.getTime() - 60 * 60_000);
    expect(isTicketAtRisk({ status: TicketStatus.RESOLVED, createdAt }, 60, NOW)).toBe(
      false,
    );
    expect(isTicketAtRisk({ status: TicketStatus.CLOSED, createdAt }, 60, NOW)).toBe(
      false,
    );
  });

  it('is false before 80% of the resolution window has elapsed', () => {
    // 60-minute window, 79% consumed = 47.4 minutes elapsed.
    const createdAt = new Date(NOW.getTime() - 47 * 60_000);
    expect(isTicketAtRisk({ status: TicketStatus.OPEN, createdAt }, 60, NOW)).toBe(
      false,
    );
  });

  it('is true once 80% of the resolution window has elapsed', () => {
    // 60-minute window, 81% consumed = 48.6 minutes elapsed.
    const createdAt = new Date(NOW.getTime() - 49 * 60_000);
    expect(isTicketAtRisk({ status: TicketStatus.OPEN, createdAt }, 60, NOW)).toBe(
      true,
    );
  });

  it('is true for NEW and PENDING, not just OPEN', () => {
    const createdAt = new Date(NOW.getTime() - 60 * 60_000);
    expect(isTicketAtRisk({ status: TicketStatus.NEW, createdAt }, 60, NOW)).toBe(true);
    expect(isTicketAtRisk({ status: TicketStatus.PENDING, createdAt }, 60, NOW)).toBe(
      true,
    );
  });
});
