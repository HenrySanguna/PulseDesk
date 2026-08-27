import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AGENT_PUBLIC_SELECT, PrismaService } from '@pulsedesk/db';
import { SESSION_COOKIE_NAME } from './auth.constants.js';
import type { AuthenticatedRequest } from './authenticated-request.js';
import { SessionsService } from './sessions.service.js';

/**
 * Authenticates agent sessions: reads the `pd_session` cookie, resolves it
 * against Valkey (never against a JWT signature — agent sessions are
 * opaque and instantly revocable, see openspec/project.md), and injects a
 * `PublicAgent` (no `passwordHash`) into the request.
 *
 * Deliberately re-fetches the agent from Postgres on every request (via
 * `AGENT_PUBLIC_SELECT`, so `passwordHash` is never even read) instead of
 * trusting a cached role/isActive snapshot from session creation time —
 * this is what makes `isActive: false` (agent deactivation) take effect on
 * the very next request without needing to touch Valkey a second time on
 * top of the session revoke.
 */
@Injectable()
export class AgentSessionGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const rawToken = request.cookies?.[SESSION_COOKIE_NAME];

    if (!rawToken) {
      throw new UnauthorizedException('No active session');
    }

    const agentId = await this.sessions.resolveAgentId(rawToken);
    if (!agentId) {
      throw new UnauthorizedException('Session expired or revoked');
    }

    const agent = await this.prisma.agent.findUnique({
      where: { id: agentId },
      select: AGENT_PUBLIC_SELECT,
    });

    if (!agent || !agent.isActive) {
      throw new UnauthorizedException('Session expired or revoked');
    }

    request.agent = agent;
    request.sessionToken = rawToken;
    return true;
  }
}
