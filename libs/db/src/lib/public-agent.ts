import type { Agent } from '../generated/client.js';

/**
 * Agent projection returned to any consumer outside `libs/db` and
 * `apps/api/src/auth`. Never carries `passwordHash`.
 *
 * This is enforced two ways: structurally (this type omits the field) and
 * mechanically (the `no-restricted-syntax` ESLint rule in the root
 * `eslint.config.mjs` forbids referencing the `passwordHash` identifier
 * anywhere outside those two locations).
 */
export type PublicAgent = Omit<Agent, 'passwordHash'>;

/** Prisma `select` projection matching {@link PublicAgent} — use this to
 * avoid ever fetching `passwordHash` from the database in the first place. */
export const AGENT_PUBLIC_SELECT = {
  id: true,
  email: true,
  role: true,
  availability: true,
  maxCapacity: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** Strips `passwordHash` from a full {@link Agent} row, for call sites that
 * already fetched the full row (e.g. to verify a password) and now need to
 * return it. Prefer {@link AGENT_PUBLIC_SELECT} when the full row isn't
 * otherwise needed. */
export function toPublicAgent(agent: Agent): PublicAgent {
  // Rest-sibling destructure is the idiomatic way to omit a property;
  // `passwordHash` itself is intentionally discarded, not accidentally
  // unused.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { passwordHash, ...publicAgent } = agent;
  return publicAgent;
}
