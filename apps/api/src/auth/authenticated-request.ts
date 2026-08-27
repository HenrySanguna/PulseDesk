import type { FastifyRequest } from 'fastify';
import type { PublicAgent } from '@pulsedesk/db';

/** Shape of the Fastify request after `AgentSessionGuard` has run:
 * `agent` is the authenticated agent (never carrying `passwordHash`) and
 * `sessionToken` is the raw cookie value, kept around only so
 * `POST /auth/logout` can revoke that exact session without re-reading the
 * cookie itself. */
export interface AuthenticatedRequest extends FastifyRequest {
  agent?: PublicAgent;
  sessionToken?: string;
}
