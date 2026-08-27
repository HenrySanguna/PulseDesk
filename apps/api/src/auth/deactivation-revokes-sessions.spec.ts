import type { ExecutionContext } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { Agent, PrismaService } from '@pulsedesk/db';
import { AgentSessionGuard } from './agent-session.guard.js';
import { AuthService } from './auth.service.js';
import { SESSION_COOKIE_NAME } from './auth.constants.js';
import type { AuthenticatedRequest } from './authenticated-request.js';
import { PasswordService } from './password.service.js';
import { SessionsService } from './sessions.service.js';
import { createFakeValkey } from './test-fakes.js';

const FULL_AGENT: Agent = {
  id: 'agent-1',
  email: 'agent@pulsedesk.test',
  passwordHash: 'irrelevant-for-this-test',
  role: 'AGENT',
  availability: 'ONLINE',
  maxCapacity: 5,
  isActive: true,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

function makeContext(request: Partial<AuthenticatedRequest>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request as AuthenticatedRequest,
    }),
  } as unknown as ExecutionContext;
}

/**
 * Definition-of-done proof: "Deactivating an agent in a test causes their
 * session cookie to fail on the immediately-following request."
 *
 * Wires the real `AuthService.deactivateAgent` (the admin endpoint's
 * service method) directly to the real `AgentSessionGuard` through a
 * shared `SessionsService`/fake-Valkey, with no mocking of the revocation
 * mechanism itself — only Postgres (Prisma) is faked, since that's the
 * only real dependency this unit test doesn't stand up for real.
 */
describe('Agent deactivation revokes sessions (definition of done)', () => {
  it('a session cookie valid on request N fails on request N+1, immediately after deactivation', async () => {
    // `findUnique` deliberately always reports `isActive: true` — this
    // isolates the Valkey session-revocation mechanism itself as the sole
    // reason request N+1 must fail. (AgentSessionGuard *also* rejects
    // `isActive: false` agents as defense in depth, but that's covered by
    // its own spec — this test proves `revokeAllSessions` alone is
    // sufficient, with the isActive defense held constant.)
    const prisma = {
      agent: {
        findUnique: () =>
          Promise.resolve({ ...FULL_AGENT, isActive: true } as unknown as Agent),
        update: () =>
          Promise.resolve({ ...FULL_AGENT, isActive: false } as unknown as Agent),
      },
    } as unknown as PrismaService;

    const sessions = new SessionsService(createFakeValkey());
    const authService = new AuthService(prisma, new PasswordService(), sessions);
    const guard = new AgentSessionGuard(prisma, sessions);

    const rawToken = await sessions.createSession(FULL_AGENT.id);
    const context = makeContext({
      cookies: { [SESSION_COOKIE_NAME]: rawToken },
    });

    // Request N: cookie is valid, agent is active.
    await expect(guard.canActivate(context)).resolves.toBe(true);

    // Admin deactivates the agent — this is the exact code path behind
    // `PATCH /auth/agents/:id/deactivate`.
    await authService.deactivateAgent(FULL_AGENT.id);

    // Request N+1: the SAME cookie, presented immediately afterward, must
    // now fail — no waiting for TTL expiry, no grace window.
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
