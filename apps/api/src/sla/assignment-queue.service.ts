import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import type Redis from 'ioredis';
import { BULLMQ_PRODUCER_CONNECTION } from './sla-connections.providers.js';
import { ASSIGNMENT_QUEUE_NAME, assignmentJobId } from './sla-queue.constants.js';

export interface AssignmentJobData {
  ticketId: string;
}

/** The one method `TicketsService.createTicket` actually needs — narrowed
 * so unit tests can pass a plain fake instead of a real `Queue`-backed
 * instance, matching the `SessionsValkeyClient`/`ValkeyHealthClient`
 * pattern already used in this codebase. */
export interface AssignmentQueuePort {
  enqueueAutoAssign(ticketId: string): Promise<void>;
}

/**
 * Producer side of the `assignment` queue — per design.md, triggered "al
 * crear un ticket sin agente preasignado" (every ticket today, since
 * `CreateTicketDto` never sets `assigneeId`). One outstanding auto-assign
 * attempt per ticket at a time (deterministic `jobId`).
 */
@Injectable()
export class AssignmentQueueService implements AssignmentQueuePort, OnModuleDestroy {
  readonly queue: Queue<AssignmentJobData>;

  constructor(@Inject(BULLMQ_PRODUCER_CONNECTION) connection: Redis) {
    this.queue = new Queue<AssignmentJobData>(ASSIGNMENT_QUEUE_NAME, { connection });
  }

  async enqueueAutoAssign(ticketId: string): Promise<void> {
    await this.queue.add(
      'assignment:auto',
      { ticketId },
      {
        jobId: assignmentJobId(ticketId),
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
