import { defineConfig } from 'vitest/config';

/**
 * Root Vitest config for backend unit tests (`apps/api`, `apps/worker`,
 * `libs/contracts`, `libs/db`, `libs/sla-engine`). Angular apps
 * (`agent-console`, `widget`) use `@angular/build:unit-test` instead and are
 * intentionally excluded here.
 *
 * `libs/ui/src/lib/table/*.spec.ts` is also included: those two files test
 * plain, framework-free functions (`sortRows`, `classifyLazyLoad`) that
 * `PdTable` delegates to — they have no Angular/DOM dependency, so they run
 * fine under this plain Node environment. `libs/ui` has no Angular
 * (`@angular/build:unit-test`) test target yet; an actual component spec
 * (one that needs `TestBed`/a DOM) must not be added to this Node-only glob.
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
      'libs/ui/src/lib/table/*.spec.ts',
    ],
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      reporter: ['text'],
    },
  },
});
