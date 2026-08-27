import { Inject, Injectable } from '@nestjs/common';
import { VALKEY_CLIENT } from '@pulsedesk/db';
import { AGENT_SESSION_TTL_SEC } from './auth.constants.js';
import { generateSessionToken, hashSessionToken } from './session-token.js';

/**
 * Only the Valkey commands session management actually needs, in the
 * single-overload shape this class calls them with, so unit tests can pass
 * a plain fake instead of a real `ioredis.Redis` instance — matches the
 * pattern already used by `HealthService`/`HeartbeatService`. A real
 * `ioredis.Redis` instance satisfies this structurally (one of its many
 * `set()` overloads matches), so no cast is needed at the real DI provider.
 */
export interface SessionsValkeyClient {
  set(
    key: string,
    value: string,
    mode: 'EX',
    ttlSeconds: number,
  ): Promise<'OK' | null>;
  get(key: string): Promise<string | null>;
  del(key: string): Promise<number>;
  sadd(key: string, member: string): Promise<number>;
  srem(key: string, member: string): Promise<number>;
  smembers(key: string): Promise<string[]>;
}

function sessionKey(tokenHash: string): string {
  return `pd:session:${tokenHash}`;
}

function agentSessionsKey(agentId: string): string {
  return `pd:agent-sessions:${agentId}`;
}

/**
 * Owns the Valkey-backed opaque session store for agent authentication.
 *
 * Two keys per session:
 * - `pd:session:<hash>` → agentId, with a TTL — the actual session record.
 * - `pd:agent-sessions:<agentId>` → a Set of that agent's session hashes,
 *   used only to make "revoke every session this agent has" (see
 *   `revokeAllSessions`) possible without a Valkey `SCAN` over the whole
 *   keyspace. Deleting this set is safe even if some of its members are
 *   already stale (their primary key already expired) — the delete is
 *   idempotent either way.
 */
@Injectable()
export class SessionsService {
  constructor(
    @Inject(VALKEY_CLIENT) private readonly valkey: SessionsValkeyClient,
  ) {}

  /** Creates a new session for `agentId` and returns the RAW token — the
   * only place the raw token ever exists outside the client's cookie. Only
   * its hash is written to Valkey. */
  async createSession(agentId: string): Promise<string> {
    const rawToken = generateSessionToken();
    const hash = hashSessionToken(rawToken);
    await this.valkey.set(
      sessionKey(hash),
      agentId,
      'EX',
      AGENT_SESSION_TTL_SEC,
    );
    await this.valkey.sadd(agentSessionsKey(agentId), hash);
    return rawToken;
  }

  /** Resolves a raw session token (as read from the `pd_session` cookie)
   * to the owning agent's id, or `null` if the session doesn't exist,
   * expired naturally, or was revoked. */
  async resolveAgentId(rawToken: string): Promise<string | null> {
    const hash = hashSessionToken(rawToken);
    return this.valkey.get(sessionKey(hash));
  }

  /** Revokes exactly one session (used by `POST /auth/logout`). */
  async revokeSession(agentId: string, rawToken: string): Promise<void> {
    const hash = hashSessionToken(rawToken);
    await this.valkey.del(sessionKey(hash));
    await this.valkey.srem(agentSessionsKey(agentId), hash);
  }

  /** Revokes every active session for `agentId` immediately (used when an
   * admin deactivates an agent) — the next request carrying any of that
   * agent's cookies fails the guard's Valkey lookup right away, with no
   * dependency on TTL expiry. The request already in flight when this
   * runs is unaffected: its guard check already happened. */
  async revokeAllSessions(agentId: string): Promise<void> {
    const hashes = await this.valkey.smembers(agentSessionsKey(agentId));
    await Promise.all(hashes.map((hash) => this.valkey.del(sessionKey(hash))));
    await this.valkey.del(agentSessionsKey(agentId));
  }
}
