import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma, SlaClock, SlaClockKind } from '@pulsedesk/db';
import { PrismaService } from '@pulsedesk/db';
import { SlaClockConflictException } from './sla-clock-conflict.exception.js';

export interface CreateSlaClockInput {
  ticketId: string;
  kind: SlaClockKind;
  targetMinutes: number;
  dueAt: Date;
  activeSince: Date;
}

/**
 * Wraps Prisma with the manual optimistic-version guard from design.md
 * ("Bloqueo optimista manual") — the only place in this change that touches
 * `prisma.slaClock` directly, so the version-guard invariant can't be
 * bypassed by a call site forgetting to check it.
 */
@Injectable()
export class SlaClockRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: CreateSlaClockInput): Promise<SlaClock> {
    return this.prisma.slaClock.create({ data });
  }

  findById(id: string): Promise<SlaClock | null> {
    return this.prisma.slaClock.findUnique({ where: { id } });
  }

  async findByIdOrThrow(id: string): Promise<SlaClock> {
    const clock = await this.findById(id);
    if (!clock) {
      throw new NotFoundException(`SLA_CLOCK_NOT_FOUND: ${id}`);
    }
    return clock;
  }

  findByTicketAndKind(ticketId: string, kind: SlaClockKind): Promise<SlaClock | null> {
    return this.prisma.slaClock.findUnique({ where: { ticketId_kind: { ticketId, kind } } });
  }

  /** Every clock for `ticketId` that is currently running (not paused, not
   * completed) — `pause(ticketId)` pauses all of these. */
  findActiveByTicket(ticketId: string): Promise<SlaClock[]> {
    return this.prisma.slaClock.findMany({
      where: { ticketId, pausedAt: null, completedAt: null },
    });
  }

  /** Every clock for `ticketId` that is currently paused (and not
   * completed) — `resume(ticketId)` resumes all of these. */
  findPausedByTicket(ticketId: string): Promise<SlaClock[]> {
    return this.prisma.slaClock.findMany({
      where: { ticketId, pausedAt: { not: null }, completedAt: null },
    });
  }

  /** Clocks the `sla:sweep` recovery job must process: due in the past,
   * still running (not paused, not completed), and not already breached —
   * see tasks.md 1.4/4.3 and the `sla_clocks_due_idx` partial index this
   * query is designed to hit. */
  findDueForSweep(now: Date): Promise<SlaClock[]> {
    return this.prisma.slaClock.findMany({
      where: {
        dueAt: { lte: now },
        completedAt: null,
        pausedAt: null,
        breachedAt: null,
      },
    });
  }

  /**
   * The manual optimistic-lock guard from design.md, verbatim: an
   * `updateMany` scoped by both `id` AND `version` (Postgres guarantees at
   * most one concurrent caller sees `count === 1`), incrementing `version`
   * on success. `updateMany` has no `RETURNING`, so the fresh row is
   * re-read after confirming the write — same pattern as
   * `TicketsService.claimTicket`.
   */
  async update(
    id: string,
    expectedVersion: number,
    data: Prisma.SlaClockUpdateInput,
  ): Promise<SlaClock> {
    const { count } = await this.prisma.slaClock.updateMany({
      where: { id, version: expectedVersion },
      data: { ...data, version: { increment: 1 } },
    });
    if (count === 0) {
      throw new SlaClockConflictException(id);
    }
    return this.prisma.slaClock.findUniqueOrThrow({ where: { id } });
  }
}
