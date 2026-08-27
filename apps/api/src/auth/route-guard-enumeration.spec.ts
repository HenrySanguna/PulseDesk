import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator.js';
import { HealthController } from '../health/health.controller.js';
import { WidgetController } from '../widget/widget.controller.js';
import { WidgetTokenGuard } from '../widget/widget-token.guard.js';
import { AgentsController } from './agents.controller.js';
import { AgentSessionGuard } from './agent-session.guard.js';
import { AuthController } from './auth.controller.js';

/**
 * Route-guard enumeration (spec: "Separación estricta de guards por tipo
 * de identidad" / task 5.4): audits every HTTP route handler across
 * apps/api's controllers and asserts each one either is explicitly
 * `@Public()` (no identity required — e.g. `/health`, `/auth/login`,
 * `POST /widget/conversations`) or carries EXACTLY ONE of
 * `AgentSessionGuard` / `WidgetTokenGuard`, never both, never neither.
 *
 * `@Public()` is a deliberate, explicit opt-out (see
 * apps/api/src/common/decorators/public.decorator.ts) rather than an
 * implicit "unlisted = fine" allowance, so a new route that forgets a
 * guard fails this test instead of silently passing it.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ControllerClass = new (...args: any[]) => object;

const CONTROLLERS: ControllerClass[] = [
  AuthController,
  AgentsController,
  WidgetController,
  HealthController,
];

interface RouteEntry {
  controller: string;
  method: string;
  isPublic: boolean;
  hasAgentGuard: boolean;
  hasWidgetGuard: boolean;
}

function getGuardsFor(target: object): unknown[] {
  const metadata: unknown = Reflect.getMetadata(GUARDS_METADATA, target);
  return Array.isArray(metadata) ? metadata : [];
}

function isPublicFor(target: object): boolean {
  return Reflect.getMetadata(IS_PUBLIC_KEY, target) === true;
}

function enumerateRoutes(ControllerClass: ControllerClass): RouteEntry[] {
  const prototype = ControllerClass.prototype as Record<string, unknown>;
  const routes: RouteEntry[] = [];

  for (const methodName of Object.getOwnPropertyNames(prototype)) {
    if (methodName === 'constructor') continue;
    const handler = prototype[methodName];
    if (typeof handler !== 'function') continue;
    // Only actual HTTP route handlers carry PATH_METADATA (set by
    // @Get/@Post/@Patch/etc.) — this excludes plain helper methods.
    if (Reflect.getMetadata(PATH_METADATA, handler) === undefined) continue;

    const guards = [
      ...getGuardsFor(ControllerClass),
      ...getGuardsFor(handler),
    ];

    routes.push({
      controller: ControllerClass.name,
      method: methodName,
      isPublic: isPublicFor(ControllerClass) || isPublicFor(handler),
      hasAgentGuard: guards.includes(AgentSessionGuard),
      hasWidgetGuard: guards.includes(WidgetTokenGuard),
    });
  }

  return routes;
}

// Computed once at module scope — from the live decorator metadata, so a
// newly added route is automatically covered without editing this file.
const ALL_ROUTES = CONTROLLERS.flatMap(enumerateRoutes);
const ROUTE_CASES = ALL_ROUTES.map(
  (r) => [`${r.controller}.${r.method}`, r] as const,
);

describe('Route guard enumeration', () => {
  it('found at least one route per controller (sanity check the audit itself is exercising real routes)', () => {
    for (const ControllerClass of CONTROLLERS) {
      const routesForController = ALL_ROUTES.filter(
        (r) => r.controller === ControllerClass.name,
      );
      expect(routesForController.length).toBeGreaterThan(0);
    }
  });

  it.each(ROUTE_CASES)(
    '%s carries exactly one of AgentSessionGuard/WidgetTokenGuard, unless explicitly @Public()',
    (_label, route) => {
      if (route.isPublic) {
        expect(route.hasAgentGuard).toBe(false);
        expect(route.hasWidgetGuard).toBe(false);
        return;
      }

      // XOR: never both, never neither.
      expect(route.hasAgentGuard).not.toBe(route.hasWidgetGuard);
    },
  );
});
