import { SetMetadata } from '@nestjs/common';

/** Metadata key checked by the route-guard-enumeration test — see
 * `apps/api/src/auth/route-guard-enumeration.spec.ts`. */
export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route handler as intentionally requiring no agent session or
 * widget token (e.g. `/auth/login`, `/widget/conversations` creation,
 * `/health`). Every other apps/api route MUST carry exactly one of
 * `AgentSessionGuard` or `WidgetTokenGuard` — enforced by the route
 * enumeration test, not by convention alone.
 */
export const Public = (): ReturnType<typeof SetMetadata> =>
  SetMetadata(IS_PUBLIC_KEY, true);
