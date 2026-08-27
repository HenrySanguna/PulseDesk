import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import {
  Prisma,
  PrismaService,
  PublicAgent,
  toPublicAgent,
} from '@pulsedesk/db';
import { PasswordService } from './password.service.js';
import { SessionsService } from './sessions.service.js';

/** Generic, identical message for every login failure — wrong password,
 * unknown email, and a deactivated agent are all indistinguishable to the
 * caller. Distinguishing any of these would let an attacker enumerate
 * valid agent emails or detect employment status changes; see
 * 02-add-dual-auth's security non-negotiables. */
const INVALID_CREDENTIALS_MESSAGE = 'Invalid email or password';

/** Fixed input hashed only when no real agent row exists for the given
 * email, so `PasswordService.verify` always runs against a real Argon2id
 * hash — a login attempt for a non-existent email takes roughly the same
 * time as one for a real email with a wrong password, which closes an
 * obvious timing side-channel an attacker could otherwise use to
 * enumerate valid emails. */
const DUMMY_PASSWORD_INPUT = 'pulsedesk-timing-mitigation-dummy-password';

export interface LoginResult {
  agent: PublicAgent;
  sessionToken: string;
}

@Injectable()
export class AuthService {
  private dummyHash: Promise<string> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionsService,
  ) {}

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= this.passwords.hash(DUMMY_PASSWORD_INPUT);
    return this.dummyHash;
  }

  async login(email: string, password: string): Promise<LoginResult> {
    const agent = await this.prisma.agent.findUnique({ where: { email } });
    const hashToVerify = agent?.passwordHash ?? (await this.getDummyHash());
    const passwordValid = await this.passwords.verify(hashToVerify, password);

    if (!agent || !agent.isActive || !passwordValid) {
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    const sessionToken = await this.sessions.createSession(agent.id);
    return { agent: toPublicAgent(agent), sessionToken };
  }

  async logout(agentId: string, sessionToken: string): Promise<void> {
    await this.sessions.revokeSession(agentId, sessionToken);
  }

  /** Deactivates an agent and immediately revokes every one of their
   * active sessions — the next request carrying any of their cookies
   * fails `AgentSessionGuard`, not just future login attempts. */
  async deactivateAgent(agentId: string): Promise<PublicAgent> {
    let agent;
    try {
      agent = await this.prisma.agent.update({
        where: { id: agentId },
        data: { isActive: false },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2025'
      ) {
        throw new NotFoundException('Agent not found');
      }
      throw err;
    }

    await this.sessions.revokeAllSessions(agentId);
    return toPublicAgent(agent);
  }
}
