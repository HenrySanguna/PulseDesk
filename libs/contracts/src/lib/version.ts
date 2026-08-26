import { createRequire } from 'node:module';

const moduleRequire = createRequire(import.meta.url);

/**
 * Version of the currently installed `@pulsedesk/contracts` package.
 *
 * Exposed via `/health` so operators can confirm which contracts revision a
 * running `apps/api` or `apps/worker` process was built against. Resolved
 * through the package specifier (not a relative path) so it survives
 * bundling — the resolution follows node_modules, not the compiled file's
 * on-disk location.
 */
export function getContractsVersion(): string {
  const pkg = moduleRequire('@pulsedesk/contracts/package.json') as {
    version: string;
  };
  return pkg.version;
}
