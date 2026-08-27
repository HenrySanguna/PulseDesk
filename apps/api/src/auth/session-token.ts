import { createHash, randomBytes } from 'node:crypto';

const SESSION_TOKEN_BYTES = 32;

/** Generates a fresh 256-bit random opaque session token (URL-safe). This
 * is the value that ends up in the `pd_session` cookie — it is never
 * stored anywhere itself; only {@link hashSessionToken}'s output is. */
export function generateSessionToken(): string {
  return randomBytes(SESSION_TOKEN_BYTES).toString('base64url');
}

/**
 * Hashes the raw session token before it is ever written to Valkey or a
 * log line — the raw token must never be persisted anywhere.
 *
 * SHA-256, not Argon2: the raw token is already a cryptographically random
 * 256-bit value (see {@link generateSessionToken}), so a slow/memory-hard
 * hash buys no brute-force resistance here — there's no low-entropy secret
 * to protect, only a lookup key to keep off disk in plaintext. Argon2
 * exists specifically to slow down guessing of low-entropy human
 * passwords (see `password.service.ts`); using it here would only add
 * needless latency to the hottest request path in the app (every
 * authenticated HTTP call).
 */
export function hashSessionToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}
