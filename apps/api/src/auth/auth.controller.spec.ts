import { describe, expect, it, vi } from 'vitest';
import type { PublicAgent } from '@pulsedesk/db';
import type { FastifyReply } from 'fastify';
import { AuthController } from './auth.controller.js';
import type { AuthService, LoginResult } from './auth.service.js';
import { AGENT_SESSION_TTL_SEC, SESSION_COOKIE_NAME } from './auth.constants.js';
import type { AuthenticatedRequest } from './authenticated-request.js';

const AGENT: PublicAgent = {
  id: 'agent-1',
  email: 'agent@pulsedesk.test',
  role: 'AGENT',
  availability: 'ONLINE',
  maxCapacity: 5,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makeReply(): FastifyReply & {
  setCookie: ReturnType<typeof vi.fn>;
  clearCookie: ReturnType<typeof vi.fn>;
} {
  return {
    setCookie: vi.fn(),
    clearCookie: vi.fn(),
  } as unknown as FastifyReply & {
    setCookie: ReturnType<typeof vi.fn>;
    clearCookie: ReturnType<typeof vi.fn>;
  };
}

describe('AuthController.login', () => {
  it('sets an httpOnly, Secure, SameSite=Strict cookie carrying the raw session token', async () => {
    const loginResult: LoginResult = { agent: AGENT, sessionToken: 'raw-token-value' };
    const authService = {
      login: vi.fn(() => Promise.resolve(loginResult)),
    } as unknown as AuthService;
    const controller = new AuthController(authService);
    const reply = makeReply();

    const response = await controller.login(
      { email: AGENT.email, password: 'whatever' },
      reply,
    );

    expect(response).toEqual({ agent: AGENT });
    expect(response.agent).not.toHaveProperty('passwordHash');
    expect(reply.setCookie).toHaveBeenCalledWith(
      SESSION_COOKIE_NAME,
      'raw-token-value',
      expect.objectContaining({
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        path: '/',
        maxAge: AGENT_SESSION_TTL_SEC,
      }),
    );
  });
});

describe('AuthController.logout', () => {
  it('revokes the session and clears the cookie', async () => {
    const authService = {
      logout: vi.fn(() => Promise.resolve()),
    } as unknown as AuthService;
    const controller = new AuthController(authService);
    const reply = makeReply();
    const request = { sessionToken: 'raw-token-value' } as AuthenticatedRequest;

    const response = await controller.logout(AGENT, request, reply);

    expect(response).toEqual({ success: true });
    expect(authService.logout).toHaveBeenCalledWith(AGENT.id, 'raw-token-value');
    expect(reply.clearCookie).toHaveBeenCalledWith(
      SESSION_COOKIE_NAME,
      expect.objectContaining({ path: '/' }),
    );
  });

  it('does not call authService.logout when there is no session token on the request', async () => {
    const authService = {
      logout: vi.fn(() => Promise.resolve()),
    } as unknown as AuthService;
    const controller = new AuthController(authService);
    const reply = makeReply();
    const request = {} as AuthenticatedRequest;

    await controller.logout(AGENT, request, reply);

    expect(authService.logout).not.toHaveBeenCalled();
    expect(reply.clearCookie).toHaveBeenCalled();
  });
});
