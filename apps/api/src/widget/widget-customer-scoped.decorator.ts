import { SetMetadata } from '@nestjs/common';

export const WIDGET_CUSTOMER_SCOPED_KEY = 'widgetCustomerScoped';

/**
 * Opt-in marker for a route guarded by `WidgetTokenGuard` that has no
 * `:conversationId` route param to check the token against, and where
 * authorizing by the token's `customerId` claim alone (not
 * `conversationId`) is an intentional, reviewed decision — e.g. a
 * customer's ticket is customer-owned, not conversation-owned.
 *
 * Without this marker, `WidgetTokenGuard` fails closed on any route
 * lacking a `:conversationId` param, so a future route can never
 * silently inherit weaker-than-intended scoping by omission.
 */
export const WidgetCustomerScoped = () =>
  SetMetadata(WIDGET_CUSTOMER_SCOPED_KEY, true);
