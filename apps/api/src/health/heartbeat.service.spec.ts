import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WORKER_HEARTBEAT_KEY } from '@pulsedesk/contracts';
import { HeartbeatService } from './heartbeat.service.js';

describe('HeartbeatService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('writes a heartbeat immediately on module init', async () => {
    const set = vi.fn().mockResolvedValue('OK');
    const service = new HeartbeatService({ set });

    service.onModuleInit();
    await vi.waitFor(() => expect(set).toHaveBeenCalledTimes(1));

    expect(set).toHaveBeenCalledWith(
      WORKER_HEARTBEAT_KEY,
      expect.any(String),
    );
    service.onModuleDestroy();
  });

  it('writes a heartbeat again after each 15s interval', async () => {
    const set = vi.fn().mockResolvedValue('OK');
    const service = new HeartbeatService({ set });

    service.onModuleInit();
    await vi.waitFor(() => expect(set).toHaveBeenCalledTimes(1));

    await vi.advanceTimersByTimeAsync(15_000);
    expect(set).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(15_000);
    expect(set).toHaveBeenCalledTimes(3);

    service.onModuleDestroy();
  });

  it('stops writing after onModuleDestroy clears the interval', async () => {
    const set = vi.fn().mockResolvedValue('OK');
    const service = new HeartbeatService({ set });

    service.onModuleInit();
    await vi.waitFor(() => expect(set).toHaveBeenCalledTimes(1));

    service.onModuleDestroy();
    await vi.advanceTimersByTimeAsync(30_000);

    expect(set).toHaveBeenCalledTimes(1);
  });

  it('logs and does not throw when Valkey is unreachable', async () => {
    const set = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const service = new HeartbeatService({ set });

    await expect(service.writeHeartbeat()).resolves.toBeUndefined();
  });
});
