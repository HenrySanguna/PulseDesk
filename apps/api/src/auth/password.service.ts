import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

/** Thin wrapper around `argon2` so `AuthService` can be tested without
 * hitting the real (deliberately slow) KDF, and so the algorithm choice
 * lives in exactly one place. */
@Injectable()
export class PasswordService {
  /** Hashes a plaintext password with Argon2id (never bcrypt/md5/sha256 —
   * see 02-add-dual-auth's security non-negotiables). */
  async hash(password: string): Promise<string> {
    return argon2.hash(password, { type: argon2.argon2id });
  }

  /** Verifies a plaintext password against a stored Argon2id hash. Never
   * throws — a malformed hash (e.g. the dummy hash's own edge cases) is
   * treated as "does not match", not as a request-crashing error. */
  async verify(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }
}
