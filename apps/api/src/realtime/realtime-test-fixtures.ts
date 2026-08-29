/** Never exported from any public barrel — only for integration tests in
 * this directory, same convention as `apps/api/src/sla/sla-test-fixtures.ts`. */

/** Polls `predicate` until it returns `true` or `timeoutMs` elapses — used
 * instead of a fixed `sleep` for real-Valkey/real-`ws` event delivery,
 * which has no fixed latency. Throws on timeout so a genuinely broken wire
 * fails the test instead of silently passing on an empty assertion. */
export async function waitFor(
  predicate: () => boolean,
  timeoutMs = 5000,
  pollIntervalMs = 25,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) {
      throw new Error(`waitFor: condition not met within ${timeoutMs}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
}
