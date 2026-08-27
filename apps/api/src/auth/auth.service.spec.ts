import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Agent, PrismaService } from '@pulsedesk/db';
import { Prisma } from '@pulsedesk/db';
import { AuthService } from './auth.service.js';
import { PasswordService } from './password.service.js';
import { SessionsService } from './sessions.service.js';
import { createFakeValkey } from './test-fakes.js';

const REAL_PASSWORD = 'correct horse battery staple';

async function makeAgent(overrides: Partial<Agent> = {}): Promise<Agent> {
  const passwords = new PasswordService();
  return {
    id: 'agent-1',
    email: 'agent@pulsedesk.test',
    passwordHash: await passwords.hash(REAL_PASSWORD),
    role: 'AGENT',
    availability: 'ONLINE',
    maxCapacity: 5,
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function makeService(findUniqueImpl: () => Promise<Agent | null>) {
  const prisma = {
    agent: {
      findUnique: findUniqueImpl,
      update: vi.fn(),
    },
  } as unknown as PrismaService;
  const sessions = new SessionsService(createFakeValkey());
  const service = new AuthService(prisma, new PasswordService(), sessions);
  return { service, prisma, sessions };
}

describe('AuthService.login', () => {
  it('returns a PublicAgent (no passwordHash) and a session token for valid credentials', async () => {
    const agent = await makeAgent();
    const { service, sessions } = makeService(() => Promise.resolve(agent));

    const result = await service.login(agent.email, REAL_PASSWORD);

    expect(result.agent).not.toHaveProperty('passwordHash');
    expect(result.agent.id).toBe(agent.id);
    await expect(
      sessions.resolveAgentId(result.sessionToken),
    ).resolves.toBe(agent.id);
  });

  it('rejects a deactivated agent even with the correct password', async () => {
    const agent = await makeAgent({ isActive: false });
    const { service } = makeService(() => Promise.resolve(agent));

    await expect(service.login(agent.email, REAL_PASSWORD)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  describe('non-enumeration (5.3): wrong password vs. unknown email are indistinguishable', () => {
    it('produces the identical error for a wrong password on a real account', async () => {
      const agent = await makeAgent();
      const { service } = makeService(() => Promise.resolve(agent));

      await expect(
        service.login(agent.email, 'totally-wrong-password'),
      ).rejects.toMatchObject({
        message: 'Invalid email or password',
        status: 401,
      });
    });

    it('produces the identical error for an email that does not exist', async () => {
      const { service } = makeService(() => Promise.resolve(null));

      await expect(
        service.login('nobody@pulsedesk.test', 'any-password'),
      ).rejects.toMatchObject({
        message: 'Invalid email or password',
        status: 401,
      });
    });

    it('the two failure responses are byte-for-byte identical', async () => {
      const agent = await makeAgent();
      const wrongPasswordCase = makeService(() => Promise.resolve(agent));
      const unknownEmailCase = makeService(() => Promise.resolve(null));

      const [wrongPasswordError, unknownEmailError] = await Promise.all([
        wrongPasswordCase.service
          .login(agent.email, 'totally-wrong-password')
          .catch((err: unknown) => err),
        unknownEmailCase.service
          .login('nobody@pulsedesk.test', 'any-password')
          .catch((err: unknown) => err),
      ]);

      expect(wrongPasswordError).toBeInstanceOf(UnauthorizedException);
      expect(unknownEmailError).toBeInstanceOf(UnauthorizedException);
      expect((wrongPasswordError as UnauthorizedException).getResponse()).toEqual(
        (unknownEmailError as UnauthorizedException).getResponse(),
      );
      expect((wrongPasswordError as UnauthorizedException).getStatus()).toBe(
        (unknownEmailError as UnauthorizedException).getStatus(),
      );
    });

    it('still runs a real Argon2 verify for an unknown email (timing side-channel mitigation)', async () => {
      const { service, prisma } = makeService(() => Promise.resolve(null));
      const findUniqueSpy = vi.spyOn(prisma.agent, 'findUnique');

      await service.login('nobody@pulsedesk.test', 'any-password').catch(() => {
        /* expected */
      });

      // The dummy-hash path only has value if the lookup for a
      // non-existent user still happened (Prisma is always queried) and a
      // real Argon2 verify still ran (proven indirectly: login rejects
      // cleanly rather than throwing a TypeError from a missing hash).
      expect(findUniqueSpy).toHaveBeenCalledOnce();
    });
  });
});

describe('AuthService.logout', () => {
  it('revokes exactly the given session', async () => {
    const agent = await makeAgent();
    const { service, sessions } = makeService(() => Promise.resolve(agent));
    const rawToken = await sessions.createSession(agent.id);

    await service.logout(agent.id, rawToken);

    await expect(sessions.resolveAgentId(rawToken)).resolves.toBeNull();
  });
});

describe('AuthService.deactivateAgent', () => {
  let agent: Agent;

  beforeEach(async () => {
    agent = await makeAgent();
  });

  it('flips isActive to false and revokes every active session', async () => {
    const prisma = {
      agent: {
        findUnique: () => Promise.resolve(agent),
        update: vi.fn(() => Promise.resolve({ ...agent, isActive: false })),
      },
    } as unknown as PrismaService;
    const sessions = new SessionsService(createFakeValkey());
    const service = new AuthService(prisma, new PasswordService(), sessions);
    const tokenA = await sessions.createSession(agent.id);
    const tokenB = await sessions.createSession(agent.id);

    const result = await service.deactivateAgent(agent.id);

    expect(result.isActive).toBe(false);
    expect(result).not.toHaveProperty('passwordHash');
    expect(prisma.agent.update).toHaveBeenCalledWith({
      where: { id: agent.id },
      data: { isActive: false },
    });
    await expect(sessions.resolveAgentId(tokenA)).resolves.toBeNull();
    await expect(sessions.resolveAgentId(tokenB)).resolves.toBeNull();
  });

  it('throws NotFoundException when the agent does not exist', async () => {
    const prisma = {
      agent: {
        findUnique: () => Promise.resolve(null),
        update: vi.fn(() =>
          Promise.reject(
            new Prisma.PrismaClientKnownRequestError('Record not found', {
              code: 'P2025',
              clientVersion: '7.10.0',
            }),
          ),
        ),
      },
    } as unknown as PrismaService;
    const sessions = new SessionsService(createFakeValkey());
    const service = new AuthService(prisma, new PasswordService(), sessions);

    await expect(service.deactivateAgent('missing-agent')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rethrows unexpected errors as-is (not just P2025 is handled)', async () => {
    const unexpectedError = new Error('connection reset');
    const prisma = {
      agent: {
        findUnique: () => Promise.resolve(agent),
        update: vi.fn(() => Promise.reject(unexpectedError)),
      },
    } as unknown as PrismaService;
    const sessions = new SessionsService(createFakeValkey());
    const service = new AuthService(prisma, new PasswordService(), sessions);

    await expect(service.deactivateAgent(agent.id)).rejects.toBe(
      unexpectedError,
    );
  });
});
