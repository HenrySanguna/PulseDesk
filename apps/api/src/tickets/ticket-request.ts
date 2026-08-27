import { UnauthorizedException } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import type { PublicAgent } from '@pulsedesk/db';
import type { WidgetTokenPayload } from '../widget/widget-token.types.js';

/** Shape of the Fastify request after `TicketRequesterGuard` has run —
 * exactly one of `agent` / `widgetToken` is populated, never both. */
export interface TicketAuthenticatedRequest extends FastifyRequest {
  agent?: PublicAgent;
  widgetToken?: WidgetTokenPayload;
}

export type TicketRequester =
  | { kind: 'agent'; agent: PublicAgent }
  | { kind: 'customer'; customerId: string };

/** Reads the populated half of `TicketAuthenticatedRequest` into a single
 * discriminated union — throws if used on a route that never ran
 * `TicketRequesterGuard`. */
export function resolveTicketRequester(
  request: TicketAuthenticatedRequest,
): TicketRequester {
  if (request.agent) {
    return { kind: 'agent', agent: request.agent };
  }
  if (request.widgetToken) {
    return { kind: 'customer', customerId: request.widgetToken.customerId };
  }
  throw new UnauthorizedException(
    'resolveTicketRequester() used on a route without TicketRequesterGuard',
  );
}
