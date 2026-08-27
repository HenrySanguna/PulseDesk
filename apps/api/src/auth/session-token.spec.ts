import { describe, expect, it } from 'vitest';
import { generateSessionToken, hashSessionToken } from './session-token.js';

describe('generateSessionToken', () => {
  it('generates a URL-safe token with enough entropy', () => {
    const token = generateSessionToken();
    expect(token.length).toBeGreaterThanOrEqual(32);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('never generates the same token twice', () => {
    const tokens = new Set(
      Array.from({ length: 100 }, () => generateSessionToken()),
    );
    expect(tokens.size).toBe(100);
  });
});

describe('hashSessionToken', () => {
  it('is deterministic for the same input', () => {
    const token = generateSessionToken();
    expect(hashSessionToken(token)).toBe(hashSessionToken(token));
  });

  it('produces different hashes for different tokens', () => {
    const a = generateSessionToken();
    const b = generateSessionToken();
    expect(hashSessionToken(a)).not.toBe(hashSessionToken(b));
  });

  it('never returns the raw token itself', () => {
    const token = generateSessionToken();
    expect(hashSessionToken(token)).not.toBe(token);
  });

  it('produces a 64-char lowercase hex sha256 digest', () => {
    const hash = hashSessionToken('some-token');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });
});
