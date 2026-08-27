import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import type { PublicAgent } from '@pulsedesk/db';
import type { AuthenticatedRequest } from '../authenticated-request.js';

/** Extracted from the `createParamDecorator` call so it's directly
 * unit-testable without going through Nest's decorator/DI machinery — see
 * `current-agent.decorator.spec.ts`. */
export function extractCurrentAgent(
  _data: unknown,
  ctx: ExecutionContext,
): PublicAgent {
  const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
  if (!request.agent) {
    throw new UnauthorizedException(
      'CurrentAgent() used on a route without AgentSessionGuard',
    );
  }
  return request.agent;
}

/** Injects the `PublicAgent` that `AgentSessionGuard` attached to the
 * request. Only usable on routes that already run `AgentSessionGuard` —
 * throws otherwise, rather than silently injecting `undefined`. */
export const CurrentAgent = createParamDecorator(extractCurrentAgent);
