/**
 * Queue names and deterministic job-id builders for the three BullMQ queues
 * this change introduces (tasks.md 2.1). Kept in one file so a queue name
 * typo between a producer and its consumer fails at compile time (both
 * import the same constant), not silently at runtime.
 */
export const SLA_QUEUE_NAME = 'sla';
export const ASSIGNMENT_QUEUE_NAME = 'assignment';
export const MAINTENANCE_QUEUE_NAME = 'maintenance';

/** Job name (not queue name) for the repeatable recovery sweep — see
 * design.md "El barrido de recuperación (sla:sweep)". */
export const SLA_SWEEP_JOB_NAME = 'sla:sweep';

/** Every 5 minutes, per design.md. */
export const SLA_SWEEP_REPEAT_MS = 5 * 60 * 1000;

/**
 * Deterministic job id for a clock's point-in-time due job — design.md's
 * exact `jobId` layer-1 idempotency scheme: `sla:${clockId}:${targetMinutes}`.
 * `targetMinutes` never changes across pause/resume for the same clock, so
 * this id is stable for the clock's whole lifetime — cancel-then-reschedule
 * during a pause/resume cycle always reuses the same slot instead of
 * leaking a new id per reschedule.
 */
export function slaDueJobId(clockId: string, targetMinutes: number): string {
  return `sla:${clockId}:${targetMinutes}`;
}

/** Deterministic job id for a ticket's auto-assignment job — one
 * outstanding auto-assign attempt per ticket at a time. */
export function assignmentJobId(ticketId: string): string {
  return `assignment:${ticketId}`;
}
