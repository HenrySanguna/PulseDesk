import { context, propagation, trace, type Context } from '@opentelemetry/api';

/** Tracer name shared by every manual span this module creates — kept in
 * one place so a tracing backend's UI groups them consistently. */
export const TRACER_NAME = 'pulsedesk-api';

export function getTracer() {
  return trace.getTracer(TRACER_NAME);
}

/**
 * Injects the currently active trace context into a plain string-keyed
 * carrier object — 06-add-polish tasks.md 4.2, the one piece of this change
 * with real technical substance (proposal.md's own "Approach" section): a
 * BullMQ job does not automatically inherit the HTTP request's trace
 * context the way an in-process `await` does, because the job payload
 * crosses a real process/event-loop-tick boundary (serialized to Valkey,
 * later deserialized by a `Worker` that may run in a different tick, or in
 * production, a different process entirely) — auto-instrumentation's
 * `AsyncLocalStorage`-based context propagation cannot follow across that
 * boundary on its own. This has to happen explicitly at enqueue time,
 * stored on the job's own `data`.
 */
export function injectTraceContext(): Record<string, string> {
  const carrier: Record<string, string> = {};
  propagation.inject(context.active(), carrier);
  return carrier;
}

/**
 * Extracts a trace context previously injected by {@link injectTraceContext}
 * — the consumer-side half of the same propagation. Returns the ambient
 * active context unchanged (effectively starting a fresh trace) when
 * `carrier` is missing/empty — e.g. the `sla:sweep` recovery job, which is
 * BullMQ-repeatable and has no originating HTTP request to link a trace
 * back to in the first place.
 */
export function extractTraceContext(
  carrier: Record<string, string> | undefined,
): Context {
  return propagation.extract(context.active(), carrier ?? {});
}
