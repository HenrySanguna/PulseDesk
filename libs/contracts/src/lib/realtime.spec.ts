import { describe, expect, it } from 'vitest';
import { computeReconnectDelayMs } from './realtime.js';

describe('computeReconnectDelayMs', () => {
  it('doubles the delay on each successive attempt', () => {
    expect(computeReconnectDelayMs(0)).toBe(500);
    expect(computeReconnectDelayMs(1)).toBe(1000);
    expect(computeReconnectDelayMs(2)).toBe(2000);
    expect(computeReconnectDelayMs(3)).toBe(4000);
  });

  it('caps the delay at maxDelayMs', () => {
    expect(computeReconnectDelayMs(10, { maxDelayMs: 15_000 })).toBe(15_000);
  });

  it('honors a custom baseDelayMs', () => {
    expect(computeReconnectDelayMs(0, { baseDelayMs: 100 })).toBe(100);
    expect(computeReconnectDelayMs(1, { baseDelayMs: 100 })).toBe(200);
  });

  it('treats a negative attempt the same as attempt 0', () => {
    expect(computeReconnectDelayMs(-5)).toBe(computeReconnectDelayMs(0));
  });
});
