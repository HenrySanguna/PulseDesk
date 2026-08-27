import type { ExecutionContext } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { PublicAgent } from '@pulsedesk/db';
import type { AuthenticatedRequest } from '../authenticated-request.js';
import { extractCurrentAgent } from './current-agent.decorator.js';

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

function makeContext(request: Partial<AuthenticatedRequest>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request as AuthenticatedRequest,
    }),
  } as unknown as ExecutionContext;
}

describe('extractCurrentAgent (CurrentAgent() decorator)', () => {
  it('returns the PublicAgent attached to the request by AgentSessionGuard', () => {
    const context = makeContext({ agent: AGENT });

    expect(extractCurrentAgent(undefined, context)).toBe(AGENT);
  });

  it('throws if AgentSessionGuard never ran (no request.agent)', () => {
    const context = makeContext({});

    expect(() => extractCurrentAgent(undefined, context)).toThrow(
      UnauthorizedException,
    );
  });
});
