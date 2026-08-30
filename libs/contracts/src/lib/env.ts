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
  // OpenTelemetry (06-add-polish tasks.md 4.1) — both optional, cost-zero
  // by default: when unset, `apps/api/src/observability/tracing.ts` exports
  // spans to the console instead of requiring any external/paid tracing
  // backend. Set OTEL_EXPORTER_OTLP_ENDPOINT to point at a real collector
  // (e.g. a local Jaeger/Grafana Tempo instance, or a hosted OTLP endpoint).
  OTEL_EXPORTER_OTLP_ENDPOINT: z.url().optional(),
  OTEL_SERVICE_NAME: z.string().min(1).optional(),
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
