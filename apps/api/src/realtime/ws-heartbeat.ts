import type { WebSocket } from 'ws';

/** design.md "Heartbeat: ping cada 30s; si no hay pong en 10s adicionales,
 * se cierra la conexión (detecta conexiones muertas que TCP no reporta a
 * tiempo)." Exposed as options (not hardcoded inside `attachHeartbeat`) so
 * tests can use short, real values against a real socket pair instead of
 * waiting 40 real seconds per test. */
export interface HeartbeatOptions {
  intervalMs: number;
  graceMs: number;
}

export const DEFAULT_HEARTBEAT_OPTIONS: HeartbeatOptions = {
  intervalMs: 30_000,
  graceMs: 10_000,
};

/**
 * Attaches ping/pong liveness detection to `client` (tasks.md 2.4, spec
 * "Cierre de conexiones ws inactivas"). Every `intervalMs`, sends a ping and
 * arms a `graceMs` timer; a `pong` disarms it. If the timer fires (no pong
 * arrived in time), the connection is forcibly terminated — `terminate()`,
 * not `close()`: a dead TCP peer would never process a close handshake
 * either, so this skips straight to destroying the socket.
 *
 * Returns a cleanup function that stops the interval/timer — callers MUST
 * invoke it on the client's `close` event, or this leaks a timer per
 * connection forever.
 */
export function attachHeartbeat(
  client: WebSocket,
  options: HeartbeatOptions = DEFAULT_HEARTBEAT_OPTIONS,
): () => void {
  let graceTimer: ReturnType<typeof setTimeout> | undefined;

  const onPong = (): void => {
    if (graceTimer) {
      clearTimeout(graceTimer);
      graceTimer = undefined;
    }
  };
  client.on('pong', onPong);

  const pingInterval = setInterval(() => {
    if (client.readyState !== client.OPEN) {
      return;
    }
    client.ping();
    graceTimer = setTimeout(() => {
      client.terminate();
    }, options.graceMs);
  }, options.intervalMs);

  return () => {
    clearInterval(pingInterval);
    if (graceTimer) {
      clearTimeout(graceTimer);
    }
    client.off('pong', onPong);
  };
}
