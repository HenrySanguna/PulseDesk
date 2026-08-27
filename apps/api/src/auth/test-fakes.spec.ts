import { describe, expect, it } from 'vitest';
import { createFakeValkey } from './test-fakes.js';

/** `createFakeValkey` stands in for real Valkey in every other spec in
 * this directory — if it were subtly wrong, it could mask a real bug (or
 * manufacture a fake failure) anywhere else. These tests pin down its
 * edge-case semantics directly. */
describe('createFakeValkey', () => {
  it('get returns null for a key that was never set', async () => {
    const valkey = createFakeValkey();
    await expect(valkey.get('missing')).resolves.toBeNull();
  });

  it('del returns 0 for a key that does not exist', async () => {
    const valkey = createFakeValkey();
    await expect(valkey.del('missing')).resolves.toBe(0);
  });

  it('del returns 1 and removes an existing string key', async () => {
    const valkey = createFakeValkey();
    await valkey.set('k', 'v', 'EX', 60);
    await expect(valkey.del('k')).resolves.toBe(1);
    await expect(valkey.get('k')).resolves.toBeNull();
  });

  it('sadd is idempotent — adding the same member twice reports it was already present', async () => {
    const valkey = createFakeValkey();
    await expect(valkey.sadd('set-key', 'member')).resolves.toBe(1);
    await expect(valkey.sadd('set-key', 'member')).resolves.toBe(0);
    await expect(valkey.smembers('set-key')).resolves.toEqual(['member']);
  });

  it('srem on a set that was never created returns 0 without throwing', async () => {
    const valkey = createFakeValkey();
    await expect(valkey.srem('never-created', 'member')).resolves.toBe(0);
  });

  it('smembers on a set that was never created returns an empty array', async () => {
    const valkey = createFakeValkey();
    await expect(valkey.smembers('never-created')).resolves.toEqual([]);
  });
});
