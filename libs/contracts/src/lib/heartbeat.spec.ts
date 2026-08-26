import { describe, expect, it } from 'vitest';
import {
  WORKER_HEARTBEAT_STALE_AFTER_SEC,
  computeHeartbeatAgeSec,
  isHeartbeatStale,
} from './heartbeat.js';

describe('computeHeartbeatAgeSec', () => {
  it('returns null when no heartbeat has ever been written', () => {
    expect(computeHeartbeatAgeSec(null)).toBeNull();
  });

  it('computes whole seconds elapsed since the last heartbeat', () => {
    const now = 1_000_000;
    const lastHeartbeat = now - 12_500;
    expect(computeHeartbeatAgeSec(lastHeartbeat, now)).toBe(12);
  });

  it('returns null for a non-numeric stored value', () => {
    expect(computeHeartbeatAgeSec(Number.NaN)).toBeNull();
  });
});

describe('isHeartbeatStale', () => {
  it('treats a missing heartbeat as stale', () => {
    expect(isHeartbeatStale(null)).toBe(true);
  });

  it('treats an age within the threshold as fresh', () => {
    expect(isHeartbeatStale(WORKER_HEARTBEAT_STALE_AFTER_SEC)).toBe(false);
  });

  it('treats an age beyond the threshold as stale', () => {
    expect(isHeartbeatStale(WORKER_HEARTBEAT_STALE_AFTER_SEC + 1)).toBe(true);
  });
});
