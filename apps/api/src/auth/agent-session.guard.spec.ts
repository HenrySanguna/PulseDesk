import type { ExecutionContext } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { PrismaService, PublicAgent } from '@pulsedesk/db';
import { AgentSessionGuard } from './agent-session.guard.js';
import { SESSION_COOKIE_NAME } from './auth.constants.js';
import type { AuthenticatedRequest } from './authenticated-request.js';
import { SessionsService } from './sessions.service.js';
import { createFakeValkey } from './test-fakes.js';

const ACTIVE_AGENT: PublicAgent = {
  id: 'agent-1',
  email: 'agent@pulsedesk.test',
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

function makePrisma(findUniqueImpl: () => Promise<PublicAgent | null>): PrismaService {
  return {
    agent: { findUnique: findUniqueImpl },
  } as unknown as PrismaService;
}

describe('AgentSessionGuard', () => {
  it('rejects a request with no session cookie', async () => {
    const guard = new AgentSessionGuard(
      makePrisma(() => Promise.resolve(ACTIVE_AGENT)),
      new SessionsService(createFakeValkey()),
    );
    const context = makeContext({ cookies: {} });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a session token that was never issued', async () => {
    const guard = new AgentSessionGuard(
      makePrisma(() => Promise.resolve(ACTIVE_AGENT)),
      new SessionsService(createFakeValkey()),
    );
    const context = makeContext({
      cookies: { [SESSION_COOKIE_NAME]: 'forged-token' },
    });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a valid session whose agent no longer exists', async () => {
    const sessions = new SessionsService(createFakeValkey());
    const rawToken = await sessions.createSession(ACTIVE_AGENT.id);
    const guard = new AgentSessionGuard(
      makePrisma(() => Promise.resolve(null)),
      sessions,
    );
    const context = makeContext({
      cookies: { [SESSION_COOKIE_NAME]: rawToken },
    });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a valid session whose agent has been deactivated', async () => {
    const sessions = new SessionsService(createFakeValkey());
    const rawToken = await sessions.createSession(ACTIVE_AGENT.id);
    const guard = new AgentSessionGuard(
      makePrisma(() => Promise.resolve({ ...ACTIVE_AGENT, isActive: false })),
      sessions,
    );
    const context = makeContext({
      cookies: { [SESSION_COOKIE_NAME]: rawToken },
    });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('accepts a valid session and injects a PublicAgent (no passwordHash) into the request', async () => {
    const sessions = new SessionsService(createFakeValkey());
    const rawToken = await sessions.createSession(ACTIVE_AGENT.id);
    const guard = new AgentSessionGuard(
      makePrisma(() => Promise.resolve(ACTIVE_AGENT)),
      sessions,
    );
    const request: Partial<AuthenticatedRequest> = {
      cookies: { [SESSION_COOKIE_NAME]: rawToken },
    };
    const context = makeContext(request);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.agent).toEqual(ACTIVE_AGENT);
    expect(request.agent).not.toHaveProperty('passwordHash');
    expect(request.sessionToken).toBe(rawToken);
  });

  it('revoking a session invalidates the NEXT request, not the one already granted', async () => {
    const sessions = new SessionsService(createFakeValkey());
    const rawToken = await sessions.createSession(ACTIVE_AGENT.id);
    const guard = new AgentSessionGuard(
      makePrisma(() => Promise.resolve(ACTIVE_AGENT)),
      sessions,
    );
    const context = makeContext({
      cookies: { [SESSION_COOKIE_NAME]: rawToken },
    });

    // Request already in flight: its guard check happens BEFORE revocation
    // and is unaffected by what happens afterward — there is no mid-request
    // re-check, by design (see AgentSessionGuard's class doc).
    const firstRequestResult = await guard.canActivate(context);
    expect(firstRequestResult).toBe(true);

    await sessions.revokeAllSessions(ACTIVE_AGENT.id);

    // The immediately-following request, reusing the exact same cookie,
    // must now fail.
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
