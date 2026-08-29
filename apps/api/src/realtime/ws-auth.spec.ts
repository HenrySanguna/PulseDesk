import type { IncomingMessage } from 'node:http';
import { describe, expect, it, vi } from 'vitest';
import { authenticateWsHandshake, parseCookieHeader, type WsAuthDeps } from './ws-auth.js';

function makeRequest(url: string, cookieHeader?: string): IncomingMessage {
  return {
    url,
    headers: { cookie: cookieHeader },
  } as unknown as IncomingMessage;
}

describe('parseCookieHeader', () => {
  it('parses multiple cookies from a single header', () => {
    expect(parseCookieHeader('a=1; b=2; pd_session=abc')).toEqual({
      a: '1',
      b: '2',
      pd_session: 'abc',
    });
  });

  it('returns an empty object for an undefined header', () => {
    expect(parseCookieHeader(undefined)).toEqual({});
  });

  it('ignores malformed segments without an "="', () => {
    expect(parseCookieHeader('a=1; garbage; b=2')).toEqual({ a: '1', b: '2' });
  });
});

describe('authenticateWsHandshake', () => {
  function makeDeps(overrides: Partial<WsAuthDeps> = {}): WsAuthDeps {
    return {
      sessions: { resolveAgentId: vi.fn().mockResolvedValue(null) },
      prisma: { agent: { findUnique: vi.fn().mockResolvedValue(null) } } as unknown as WsAuthDeps['prisma'],
      jwt: { verifyAsync: vi.fn().mockRejectedValue(new Error('invalid token')) },
      ...overrides,
    };
  }

  it('resolves a widget identity from a valid ?token= query param', async () => {
    const deps = makeDeps({
      jwt: {
        verifyAsync: vi.fn().mockResolvedValue({ conversationId: 'conv-1', customerId: 'cust-1' }),
      },
    });

    const result = await authenticateWsHandshake(makeRequest('/ws?token=abc'), deps);

    expect(result).toEqual({ kind: 'widget', conversationId: 'conv-1', customerId: 'cust-1' });
  });

  it('returns null for an invalid/expired widget token', async () => {
    const deps = makeDeps();
    const result = await authenticateWsHandshake(makeRequest('/ws?token=bad'), deps);
    expect(result).toBeNull();
  });

  it('resolves an agent identity from a valid pd_session cookie', async () => {
    const deps = makeDeps({
      sessions: { resolveAgentId: vi.fn().mockResolvedValue('agent-1') },
      prisma: {
        agent: {
          findUnique: vi.fn().mockResolvedValue({ id: 'agent-1', isActive: true }),
        },
      } as unknown as WsAuthDeps['prisma'],
    });

    const result = await authenticateWsHandshake(makeRequest('/ws', 'pd_session=raw-token'), deps);

    expect(result).toEqual({ kind: 'agent', agentId: 'agent-1' });
  });

  it('returns null when the agent behind the session is deactivated', async () => {
    const deps = makeDeps({
      sessions: { resolveAgentId: vi.fn().mockResolvedValue('agent-1') },
      prisma: {
        agent: {
          findUnique: vi.fn().mockResolvedValue({ id: 'agent-1', isActive: false }),
        },
      } as unknown as WsAuthDeps['prisma'],
    });

    const result = await authenticateWsHandshake(makeRequest('/ws', 'pd_session=raw-token'), deps);

    expect(result).toBeNull();
  });

  it('returns null when neither a token query param nor a session cookie is present', async () => {
    const deps = makeDeps();
    const result = await authenticateWsHandshake(makeRequest('/ws'), deps);
    expect(result).toBeNull();
  });
});
