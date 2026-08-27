import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import type { PublicAgent } from '@pulsedesk/db';
import type { AuthenticatedRequest } from './authenticated-request.js';
import { ROLES_KEY } from './decorators/roles.decorator.js';
import { RoleGuard } from './role.guard.js';

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

function makeContext(
  request: Partial<AuthenticatedRequest>,
  roles: string[] | undefined,
): ExecutionContext {
  const handler = () => undefined;
  if (roles !== undefined) {
    Reflect.defineMetadata(ROLES_KEY, roles, handler);
  }
  return {
    getHandler: () => handler,
    getClass: () => class {},
    switchToHttp: () => ({
      getRequest: () => request as AuthenticatedRequest,
    }),
  } as unknown as ExecutionContext;
}

describe('RoleGuard', () => {
  it('allows the request when no roles are required', () => {
    const guard = new RoleGuard(new Reflector());
    const context = makeContext({ agent: AGENT }, undefined);

    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows an agent whose role is in the required list', () => {
    const guard = new RoleGuard(new Reflector());
    const context = makeContext({ agent: { ...AGENT, role: 'ADMIN' } }, [
      'ADMIN',
    ]);

    expect(guard.canActivate(context)).toBe(true);
  });

  it('rejects an agent whose role is not in the required list', () => {
    const guard = new RoleGuard(new Reflector());
    const context = makeContext({ agent: { ...AGENT, role: 'AGENT' } }, [
      'ADMIN',
    ]);

    expect(guard.canActivate(context)).toBe(false);
  });

  it('throws if used without AgentSessionGuard having run first', () => {
    const guard = new RoleGuard(new Reflector());
    const context = makeContext({}, ['ADMIN']);

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
