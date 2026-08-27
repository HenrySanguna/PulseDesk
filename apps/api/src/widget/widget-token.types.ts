import type { FastifyRequest } from 'fastify';

/** JWT payload signed by `WidgetService.createOrGetConversation` and
 * verified by `WidgetTokenGuard`. Scoped to exactly one conversation for
 * any route addressed by `:conversationId` — a token for conversation A
 * must never authorize an action on conversation B, even for the same
 * customerId. `WidgetTokenGuard` enforces this unconditionally and fails
 * closed on any route with no `:conversationId` param, UNLESS that route
 * is explicitly marked `@WidgetCustomerScoped()` (see that decorator) to
 * intentionally authorize by `customerId` alone instead — e.g. reading a
 * customer-owned resource that has no single owning conversation. */
export interface WidgetTokenPayload {
  conversationId: string;
  customerId: string;
}

export interface WidgetAuthenticatedRequest extends FastifyRequest {
  widgetToken?: WidgetTokenPayload;
}
