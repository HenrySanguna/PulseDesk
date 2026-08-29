import { ConflictException } from '@nestjs/common';

/**
 * Thrown by `SlaClockRepository.update()` when the optimistic version guard
 * loses — another process (agent pausing, worker breaching, sweep
 * recovering) already updated the same clock. See design.md "Bloqueo
 * optimista manual": the caller decides how to react (the API retries by
 * re-reading, a job consumer discards silently — see
 * `SlaClockService.breach()`).
 */
export class SlaClockConflictException extends ConflictException {
  constructor(public readonly clockId: string) {
    super(`SLA_CLOCK_VERSION_CONFLICT: clock ${clockId} was modified by another process`);
  }
}
