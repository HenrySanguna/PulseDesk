import type { SessionsValkeyClient } from './sessions.service.js';

/** In-memory fake matching {@link SessionsValkeyClient} — enough to unit
 * test `SessionsService`/`AgentSessionGuard` without a real Valkey. TTLs
 * are accepted but not enforced (these tests assert revocation, which is
 * TTL-independent by design — see `SessionsService.revokeAllSessions`). */
export function createFakeValkey(): SessionsValkeyClient {
  const strings = new Map<string, string>();
  const sets = new Map<string, Set<string>>();

  return {
    async set(key, value) {
      strings.set(key, value);
      return 'OK';
    },
    async get(key) {
      return strings.has(key) ? (strings.get(key) as string) : null;
    },
    async del(key) {
      const removedString = strings.delete(key);
      const removedSet = sets.delete(key);
      return removedString || removedSet ? 1 : 0;
    },
    async sadd(key, member) {
      const set = sets.get(key) ?? new Set<string>();
      const added = !set.has(member);
      set.add(member);
      sets.set(key, set);
      return added ? 1 : 0;
    },
    async srem(key, member) {
      const set = sets.get(key);
      if (!set) return 0;
      return set.delete(member) ? 1 : 0;
    },
    async smembers(key) {
      return Array.from(sets.get(key) ?? []);
    },
  };
}
