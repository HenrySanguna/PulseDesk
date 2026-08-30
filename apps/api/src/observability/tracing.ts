/**
 * OpenTelemetry bootstrap (06-add-polish tasks.md 4.1). MUST be the first
 * thing `main.ts` imports — before `@nestjs/platform-fastify`, `ioredis`,
 * `@prisma/client`, or any other instrumented module is required, so the
 * instrumentation packages below can patch them before first use. See the
 * "Nota de arquitectura: sin `apps/worker` separado" in tasks.md for why
 * this instruments `apps/api` only, not a separate `apps/worker` process.
 *
 * Zero-cost by default: without `OTEL_EXPORTER_OTLP_ENDPOINT` set, spans
 * export to the console instead of requiring any external tracing backend —
 * openspec/config.yaml's "restricción de coste cero" applies here exactly
 * like it did to `04-add-sla-jobs`/`05-add-realtime-hybrid`'s hosting
 * decisions.
 */
import { NodeSDK } from '@opentelemetry/sdk-node';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { IORedisInstrumentation } from '@opentelemetry/instrumentation-ioredis';
import { PrismaInstrumentation } from '@prisma/instrumentation';
import type { SpanExporter } from '@opentelemetry/sdk-trace-base';

const otlpEndpoint = process.env['OTEL_EXPORTER_OTLP_ENDPOINT'];
const traceExporter: SpanExporter = otlpEndpoint
  ? new OTLPTraceExporter({ url: `${otlpEndpoint}/v1/traces` })
  : new ConsoleSpanExporter();

const sdk = new NodeSDK({
  serviceName: process.env['OTEL_SERVICE_NAME'] ?? 'pulsedesk-api',
  traceExporter,
  instrumentations: [
    // Node's core `http`/`https` module, which Fastify (and every outgoing
    // HTTP call this process makes) runs on top of — creates the root span
    // for every incoming request, and is what `traceId` at "point 1" of
    // tasks.md 4.3's four-point trace actually comes from.
    new HttpInstrumentation(),
    // Covers both this app's own health/session Valkey calls AND BullMQ's
    // internal Redis commands (BullMQ is built directly on `ioredis`) — see
    // `observability/trace-propagation.ts` for why BullMQ's queue-crossing
    // itself still needs EXPLICIT propagation on top of this.
    new IORedisInstrumentation(),
    new PrismaInstrumentation(),
  ],
});

sdk.start();

process.on('SIGTERM', () => {
  void sdk.shutdown().finally(() => process.exit(0));
});
