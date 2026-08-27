import type { PrismaService } from '@pulsedesk/db';
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

/**
 * Creates a real `Agent` row for integration tests OUTSIDE this module
 * (e.g. `apps/api/src/tickets`) that need a real agent to satisfy a
 * foreign key, but never verify its password. The actual `passwordHash`
 * field access is kept in this file — the one apps/api subtree the
 * `no-restricted-syntax` ESLint rule allows — so callers never need to
 * reference the identifier directly.
 */
export async function seedTestAgent(
  prisma: Pick<PrismaService, 'agent'>,
  data: { id: string; email: string },
): Promise<void> {
  await prisma.agent.create({
    data: { ...data, passwordHash: 'irrelevant-for-integration-tests' },
  });
}
