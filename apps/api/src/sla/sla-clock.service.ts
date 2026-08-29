import { Injectable, NotFoundException } from '@nestjs/common';
import type { BusinessCalendar } from '@pulsedesk/sla-engine';
import { addBusinessMinutes, businessMinutesBetween } from '@pulsedesk/sla-engine';
import type { SlaClock, SlaClockKind } from '@pulsedesk/db';
import { PrismaService, TicketEventType } from '@pulsedesk/db';
import { BusinessCalendarRepository } from './business-calendar.repository.js';
import { SlaClockConflictException } from './sla-clock-conflict.exception.js';
import { SlaClockRepository } from './sla-clock.repository.js';
import { SlaQueueService } from './sla-queue.service.js';

/**
 * Owns every `SlaClock` state transition (tasks.md section 3) and the
 * matching `sla` queue side effect. Consumers (`SlaConsumer`,
 * `SlaSweepConsumer`) stay thin: they only call `breach()`.
 */
@Injectable()
export class SlaClockService {
  constructor(
    private readonly repo: SlaClockRepository,
    private readonly calendars: BusinessCalendarRepository,
    private readonly slaQueue: SlaQueueService,
    private readonly prisma: PrismaService,
  ) {}

  /** Creates a new clock for `ticketId`/`kind` with `targetMinutes` of
   * business time, and schedules its due job. Throws (Prisma unique
   * constraint) if a clock for this ticket/kind already exists — `start`
   * is a one-shot creation, not idempotent by design (unlike
   * pause/resume/complete/breach, which are). */
  async start(ticketId: string, kind: SlaClockKind, targetMinutes: number): Promise<SlaClock> {
    const calendar = await this.calendars.getActive();
    const now = new Date();
    const dueAt = addBusinessMinutes(now, targetMinutes, calendar);
    const clock = await this.repo.create({
      ticketId,
      kind,
      targetMinutes,
      dueAt,
      activeSince: now,
    });
    await this.slaQueue.scheduleDueJob(clock, dueAt);
    return clock;
  }

  /** Pauses every currently-running clock for `ticketId` (tasks.md 3.1):
   * folds the business minutes consumed since `activeSince` into
   * `consumedMinutes`, clears `dueAt`, and cancels the due job. A ticket
   * with no running clocks is a no-op (empty array). */
  async pause(ticketId: string): Promise<SlaClock[]> {
    const clocks = await this.repo.findActiveByTicket(ticketId);
    if (clocks.length === 0) {
      return [];
    }
    const calendar = await this.calendars.getActive();
    const now = new Date();
    const results: SlaClock[] = [];
    for (const clock of clocks) {
      results.push(await this.pauseOne(clock, calendar, now));
    }
    return results;
  }

  private async pauseOne(
    clock: SlaClock,
    calendar: BusinessCalendar,
    now: Date,
  ): Promise<SlaClock> {
    // `businessMinutesBetween` returns a float (fractional minutes);
    // `consumedMinutes` is a Postgres `Int` column, so this rounds before
    // persisting — Prisma rejects a non-integer value for an `Int` field.
    const consumedThisRun = Math.round(businessMinutesBetween(clock.activeSince, now, calendar));
    const updated = await this.repo.update(clock.id, clock.version, {
      consumedMinutes: clock.consumedMinutes + consumedThisRun,
      pausedAt: now,
      dueAt: null,
    });
    await this.slaQueue.cancelDueJob(clock);
    return updated;
  }

  /** Resumes every currently-paused clock for `ticketId` (tasks.md 3.2):
   * recomputes the remaining business minutes, recalculates `dueAt` from
   * `now`, and reschedules the due job. A ticket with no paused clocks is a
   * no-op (empty array). */
  async resume(ticketId: string): Promise<SlaClock[]> {
    const clocks = await this.repo.findPausedByTicket(ticketId);
    if (clocks.length === 0) {
      return [];
    }
    const calendar = await this.calendars.getActive();
    const now = new Date();
    const results: SlaClock[] = [];
    for (const clock of clocks) {
      results.push(await this.resumeOne(clock, calendar, now));
    }
    return results;
  }

  private async resumeOne(
    clock: SlaClock,
    calendar: BusinessCalendar,
    now: Date,
  ): Promise<SlaClock> {
    const remaining = Math.max(clock.targetMinutes - clock.consumedMinutes, 0);
    const dueAt = addBusinessMinutes(now, remaining, calendar);
    const updated = await this.repo.update(clock.id, clock.version, {
      pausedAt: null,
      activeSince: now,
      dueAt,
    });
    await this.slaQueue.scheduleDueJob(updated, dueAt);
    return updated;
  }

  /** Completes the `kind` clock for `ticketId` (tasks.md 3.3) — idempotent
   * by checking `completedAt` before writing, so resolving an already
   * resolved ticket (or a retried caller) is a safe no-op. Cancels the due
   * job so it never fires after completion. Returns `null` if no such
   * clock exists (nothing to complete). */
  async complete(ticketId: string, kind: SlaClockKind): Promise<SlaClock | null> {
    const clock = await this.repo.findByTicketAndKind(ticketId, kind);
    if (!clock) {
      return null;
    }
    if (clock.completedAt) {
      return clock;
    }
    const updated = await this.repo.update(clock.id, clock.version, {
      completedAt: new Date(),
      dueAt: null,
    });
    await this.slaQueue.cancelDueJob(clock);
    return updated;
  }

  /**
   * Marks `clockId` breached and records exactly one `SLA_BREACHED`
   * `TicketEvent` — the single business effect tasks.md 5.1 requires,
   * regardless of how many times this runs for the same clock. Called by
   * both `SlaConsumer` (point-in-time due job) and `SlaSweepConsumer`
   * (recovery sweep) — same method, same guarantee, either path.
   *
   * Two idempotency layers (design.md "Dos capas de idempotencia"):
   *  1. State reread — `breachedAt`/`pausedAt`/`completedAt` already set
   *     means "nothing to do", checked BEFORE writing.
   *  2. Optimistic version guard — if two callers still race past (1)
   *     simultaneously, only one `updateMany` succeeds; the loser's
   *     `SlaClockConflictException` is swallowed here (the winner already
   *     produced the one event this breach needed).
   *
   * Returns the updated clock, the clock unchanged if it was already
   * breached, or `null` if the clock is gone, paused, completed, or lost
   * the version race.
   */
  async breach(clockId: string): Promise<SlaClock | null> {
    const clock = await this.repo.findById(clockId);
    if (!clock) {
      return null;
    }
    if (clock.completedAt || clock.pausedAt || clock.breachedAt) {
      return clock.breachedAt ? clock : null;
    }

    const now = new Date();
    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        const { count } = await tx.slaClock.updateMany({
          where: { id: clock.id, version: clock.version },
          data: { breachedAt: now, version: { increment: 1 } },
        });
        if (count === 0) {
          throw new SlaClockConflictException(clock.id);
        }
        await tx.ticketEvent.create({
          data: {
            ticketId: clock.ticketId,
            type: TicketEventType.SLA_BREACHED,
            payload: { kind: clock.kind, clockId: clock.id },
          },
        });
        return tx.slaClock.findUniqueOrThrow({ where: { id: clock.id } });
      });
      await this.slaQueue.cancelDueJob(clock);
      return updated;
    } catch (err) {
      if (err instanceof SlaClockConflictException) {
        return null;
      }
      throw err;
    }
  }

  async findByTicketAndKind(ticketId: string, kind: SlaClockKind): Promise<SlaClock> {
    const clock = await this.repo.findByTicketAndKind(ticketId, kind);
    if (!clock) {
      throw new NotFoundException(`SLA_CLOCK_NOT_FOUND: ${ticketId}/${kind}`);
    }
    return clock;
  }
}
