import { describe, expect, it } from 'vitest';
import { SessionsService } from './sessions.service.js';
import { createFakeValkey } from './test-fakes.js';

describe('SessionsService', () => {
  it('resolves the agentId for a token it just issued', async () => {
    const sessions = new SessionsService(createFakeValkey());
    const rawToken = await sessions.createSession('agent-1');

    await expect(sessions.resolveAgentId(rawToken)).resolves.toBe('agent-1');
  });

  it('never stores the raw token — only its hash is used as the Valkey key', async () => {
    const valkey = createFakeValkey();
    const sessions = new SessionsService(valkey);
    const rawToken = await sessions.createSession('agent-1');

    // resolveAgentId re-derives the hash and looks it up — if the service
    // had instead stored the raw token as the key, this direct raw-token
    // lookup would succeed. It must not.
    await expect(valkey.get(`pd:session:${rawToken}`)).resolves.toBeNull();
  });

  it('resolves to null for a token that was never issued', async () => {
    const sessions = new SessionsService(createFakeValkey());

    await expect(sessions.resolveAgentId('never-issued')).resolves.toBeNull();
  });

  it('revokeSession invalidates exactly that session', async () => {
    const sessions = new SessionsService(createFakeValkey());
    const rawToken = await sessions.createSession('agent-1');

    await sessions.revokeSession('agent-1', rawToken);

    await expect(sessions.resolveAgentId(rawToken)).resolves.toBeNull();
  });

  it('revokeSession does not affect the agent\'s other sessions', async () => {
    const sessions = new SessionsService(createFakeValkey());
    const tokenA = await sessions.createSession('agent-1');
    const tokenB = await sessions.createSession('agent-1');

    await sessions.revokeSession('agent-1', tokenA);

    await expect(sessions.resolveAgentId(tokenA)).resolves.toBeNull();
    await expect(sessions.resolveAgentId(tokenB)).resolves.toBe('agent-1');
  });

  it('revokeAllSessions invalidates every session for that agent, but not other agents', async () => {
    const sessions = new SessionsService(createFakeValkey());
    const tokenA1 = await sessions.createSession('agent-1');
    const tokenA2 = await sessions.createSession('agent-1');
    const tokenB1 = await sessions.createSession('agent-2');

    await sessions.revokeAllSessions('agent-1');

    await expect(sessions.resolveAgentId(tokenA1)).resolves.toBeNull();
    await expect(sessions.resolveAgentId(tokenA2)).resolves.toBeNull();
    await expect(sessions.resolveAgentId(tokenB1)).resolves.toBe('agent-2');
  });

  it('revokeAllSessions is a no-op (not an error) for an agent with no sessions', async () => {
    const sessions = new SessionsService(createFakeValkey());

    await expect(sessions.revokeAllSessions('never-logged-in')).resolves.toBeUndefined();
  });
});
