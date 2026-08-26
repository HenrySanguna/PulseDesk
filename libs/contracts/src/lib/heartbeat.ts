/**
 * Valkey key the worker writes a heartbeat timestamp to, and `apps/api`'s
 * `/health` endpoint reads. Shared here so both processes agree on the key
 * without importing from each other (forbidden by the `scope:api` /
 * `scope:worker` boundary rules — see eslint.config.mjs).
 */
export const WORKER_HEARTBEAT_KEY = 'pulsedesk:worker:heartbeat';

/** Maximum interval between heartbeat writes, per the observability spec. */
export const WORKER_HEARTBEAT_INTERVAL_MS = 15_000;

/** Heartbeat age (seconds) beyond which the worker is considered stale. */
export const WORKER_HEARTBEAT_STALE_AFTER_SEC = 60;

/**
 * Computes the heartbeat age in whole seconds from a stored timestamp
 * (milliseconds since epoch). Returns `null` when no heartbeat has ever
 * been written (e.g. the worker has never started).
 */
export function computeHeartbeatAgeSec(
  lastHeartbeatMs: number | null,
  nowMs: number = Date.now(),
): number | null {
  if (lastHeartbeatMs === null || Number.isNaN(lastHeartbeatMs)) {
    return null;
  }
  return Math.floor((nowMs - lastHeartbeatMs) / 1000);
}

/**
 * A missing heartbeat (`null`) or one older than
 * {@link WORKER_HEARTBEAT_STALE_AFTER_SEC} is considered stale.
 */
export function isHeartbeatStale(ageSec: number | null): boolean {
  return ageSec === null || ageSec > WORKER_HEARTBEAT_STALE_AFTER_SEC;
}
