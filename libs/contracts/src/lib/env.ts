import { z } from 'zod';

/**
 * Minimum environment contract shared by `apps/api` and `apps/worker`.
 *
 * Validated with Zod instead of `class-validator` because this check must
 * run before any Nest DI container exists (see design.md — "Env validation").
 * `class-validator` needs a decorated class plus `ValidationPipe`, both of
 * which are DI-bound and only available after `NestFactory.create`.
 */
export const envSchema = z.object({
  DATABASE_URL: z.url(),
  REDIS_URL: z.url(),
  // Signs/verifies widget conversation JWTs (apps/api/src/widget). Never
  // used for agent sessions — those are opaque tokens, not JWTs, per
  // openspec/project.md.
  WIDGET_JWT_SECRET: z.string().min(32),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Parses `process.env` against {@link envSchema} and exits the process with
 * a non-zero code if any required variable is missing or malformed. Must be
 * called before `NestFactory.create` / `NestFactory.createApplicationContext`
 * so a misconfigured process never accepts connections or starts consumers.
 */
export function parseEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error(
      'Invalid environment configuration:',
      z.treeifyError(result.error),
    );
    process.exit(1);
  }
  return result.data;
}
