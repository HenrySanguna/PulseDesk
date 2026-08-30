import { defineConfig } from 'vitest/config';

/**
 * Root Vitest config for backend unit tests (`apps/api`, `apps/worker`,
 * `libs/contracts`, `libs/db`, `libs/sla-engine`). Angular apps
 * (`agent-console`, `widget`) use `@angular/build:unit-test` instead and are
 * intentionally excluded here.
 *
 * `libs/ui` is ALSO excluded here (06-add-polish): it now has its own
 * `@angular/build:unit-test` target (`ui:test`, `libs/ui/project.json`,
 * reusing `agent-console`'s `build` target the same way `agent-console:test`
 * itself works — no new test infra invented) that covers every spec under
 * `libs/ui/src`, both the plain framework-free ones (`sort-rows.spec.ts`,
 * `lazy-load-classifier.spec.ts`) AND real Angular `TestBed` component specs
 * (`table.spec.ts`) that need jsdom/the Angular compiler, which this
 * Node-only config cannot provide. Keeping ui specs out of this glob avoids
 * a component spec ever silently landing here and failing for lack of DOM.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'apps/api/src/**/*.spec.ts',
      'apps/worker/src/**/*.spec.ts',
      'libs/contracts/src/**/*.spec.ts',
      'libs/db/src/**/*.spec.ts',
      'libs/sla-engine/src/**/*.spec.ts',
    ],
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      reporter: ['text'],
    },
  },
});
