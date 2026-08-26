import { defineConfig } from 'vitest/config';

/**
 * Root Vitest config for backend unit tests (`apps/api`, `apps/worker`,
 * `libs/contracts`, `libs/db`). Angular apps (`agent-console`, `widget`) use
 * `@angular/build:unit-test` instead and are intentionally excluded here.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'apps/api/src/**/*.spec.ts',
      'apps/worker/src/**/*.spec.ts',
      'libs/contracts/src/**/*.spec.ts',
      'libs/db/src/**/*.spec.ts',
    ],
    passWithNoTests: true,
  },
});
