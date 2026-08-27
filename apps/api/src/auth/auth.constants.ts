/** Cookie carrying the raw (unhashed) agent session token. Set by
 * `POST /auth/login`, read by `AgentSessionGuard`, cleared by
 * `POST /auth/logout`. */
export const SESSION_COOKIE_NAME = 'pd_session';

/** Agent session lifetime (12h — a working day). Matches the Valkey key's
 * TTL, so an unrevoked session simply expires on its own; a revoked one
 * (see `SessionsService.revokeSession` / `revokeAllSessions`) is deleted
 * immediately and independently of this TTL. */
export const AGENT_SESSION_TTL_SEC = 60 * 60 * 12;
