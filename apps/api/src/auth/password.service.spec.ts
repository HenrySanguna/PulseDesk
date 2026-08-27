import { describe, expect, it } from 'vitest';
import { PasswordService } from './password.service.js';

describe('PasswordService', () => {
  const service = new PasswordService();

  it('hashes with argon2id (never bcrypt/md5/sha256)', async () => {
    const hash = await service.hash('correct horse battery staple');
    expect(hash.startsWith('$argon2id$')).toBe(true);
  });

  it('verifies a password against its own hash', async () => {
    const hash = await service.hash('correct horse battery staple');
    await expect(service.verify(hash, 'correct horse battery staple')).resolves.toBe(
      true,
    );
  });

  it('rejects the wrong password', async () => {
    const hash = await service.hash('correct horse battery staple');
    await expect(service.verify(hash, 'wrong password')).resolves.toBe(false);
  });

  it('never throws on a malformed hash — treats it as no match', async () => {
    await expect(service.verify('not-a-real-hash', 'anything')).resolves.toBe(
      false,
    );
  });

  it('produces a different hash each time (random salt)', async () => {
    const [a, b] = await Promise.all([
      service.hash('same-password'),
      service.hash('same-password'),
    ]);
    expect(a).not.toBe(b);
  });
});
