import type { FastifyRequest } from 'fastify';

/** JWT payload signed by `WidgetService.createOrGetConversation` and
 * verified by `WidgetTokenGuard`. Scoped to exactly one conversation — a
 * token for conversation A must never authorize an action on conversation
 * B, even for the same customerId. */
export interface WidgetTokenPayload {
  conversationId: string;
  customerId: string;
}

export interface WidgetAuthenticatedRequest extends FastifyRequest {
  widgetToken?: WidgetTokenPayload;
}
