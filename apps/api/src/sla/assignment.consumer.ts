import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { context } from '@opentelemetry/api';
import { Worker, type Job } from 'bullmq';
import type Redis from 'ioredis';
import { getAgentLoad, PrismaService, TicketEventType, TicketStatus } from '@pulsedesk/db';
import { extractTraceContext, getTracer } from '../observability/trace-propagation.js';
import { ASSIGNMENT_WORKER_CONNECTION } from './sla-connections.providers.js';
import type { AssignmentJobData } from './assignment-queue.service.js';
import { ASSIGNMENT_QUEUE_NAME } from './sla-queue.constants.js';
import { pickAssignmentCandidate } from './round-robin.js';

/**
 * Consumer side of the `assignment` queue (tasks.md 4.2): round-robin
 * auto-assignment by load relative to capacity, tie-broken by longest time
 * since last assignment. Reuses the exact atomic-claim pattern from
 * `TicketsService.claimTicket` (`updateMany` scoped by `assigneeId: null`)
 * so a ticket claimed manually by an agent between the read and the write
 * is never double-assigned — the `updateMany` simply matches zero rows and
 * this consumer treats that as "nothing to do", not an error.
 */
@Injectable()
export class AssignmentConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AssignmentConsumer.name);
  private worker?: Worker<AssignmentJobData>;

  constructor(
    @Inject(ASSIGNMENT_WORKER_CONNECTION) private readonly connection: Redis,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit(): void {
    this.worker = new Worker<AssignmentJobData>(
      ASSIGNMENT_QUEUE_NAME,
      (job) => this.processJob(job),
      { connection: this.connection },
    );
    this.worker.on('error', (err) => {
      this.logger.warn(`Assignment worker error: ${err.message}`);
    });
  }

  /** Extracts the job's propagated trace context (06-add-polish tasks.md
   * 4.2 — see `SlaConsumer.process`'s matching doc comment) and runs
   * `process()` within it. */
  async processJob(job: Job<AssignmentJobData>): Promise<void> {
    const extracted = extractTraceContext(job.data.traceContext);
    await context.with(extracted, () =>
      getTracer().startActiveSpan('assignment.consumer.process', async (span) => {
        try {
          await this.process(job.data.ticketId);
        } finally {
          span.end();
        }
      }),
    );
  }

  /** Idempotent: re-reads the ticket first (already-assigned or gone means
   * nothing to do), and the final write is itself an atomic conditional
   * claim — safe to call more than once for the same ticket. */
  async process(ticketId: string): Promise<void> {
    const ticket = await this.prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket || ticket.assigneeId) {
      return;
    }

    const candidates = await getAgentLoad(this.prisma);
    const agentId = pickAssignmentCandidate(candidates);
    if (!agentId) {
      // No agent has capacity right now — left unassigned. The ticket
      // stays visible in the manual unassigned queue (03-add-ticket-queue);
      // no requeue/retry is defined by this change's scope.
      return;
    }

    const { count } = await this.prisma.ticket.updateMany({
      where: { id: ticketId, assigneeId: null },
      data: { assigneeId: agentId, status: TicketStatus.OPEN },
    });
    if (count === 0) {
      return;
    }

    await this.prisma.$transaction([
      this.prisma.agent.update({
        where: { id: agentId },
        data: { lastAssignedAt: new Date() },
      }),
      this.prisma.ticketEvent.create({
        data: {
          ticketId,
          type: TicketEventType.ASSIGNED,
          payload: { auto: true, agentId },
        },
      }),
    ]);
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }
}
