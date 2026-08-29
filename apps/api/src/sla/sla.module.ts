import { Module } from '@nestjs/common';
import { PrismaService } from '@pulsedesk/db';
import { AssignmentConsumer } from './assignment.consumer.js';
import { AssignmentQueueService } from './assignment-queue.service.js';
import { BusinessCalendarRepository } from './business-calendar.repository.js';
import { MaintenanceQueueService } from './maintenance-queue.service.js';
import { bullMqConnectionProviders } from './sla-connections.providers.js';
import { SlaClockRepository } from './sla-clock.repository.js';
import { SlaClockService } from './sla-clock.service.js';
import { SlaConsumer } from './sla.consumer.js';
import { SlaQueueService } from './sla-queue.service.js';
import { SlaSweepConsumer } from './sla-sweep.consumer.js';

/**
 * Everything 04-add-sla-jobs adds, in one module: `SlaClock`
 * persistence/repository, the three BullMQ queues (producers) and their
 * consumers (workers), and the domain service that ties them together.
 *
 * Runs entirely inside `apps/api` — there is no separate `apps/worker`
 * deployable (see `d1c07a9`: folded into `apps/api` because no genuinely
 * free host supports an always-on second process). Queue producers and job
 * consumers are still logically distinct (separate classes, separate
 * Valkey connections per `sla-connections.providers.ts`) so the
 * distributed-systems shape design.md describes (schedule vs. execute,
 * survive the other side's failure) still holds, just co-located in one
 * process rather than two.
 */
@Module({
  providers: [
    PrismaService,
    ...bullMqConnectionProviders,
    SlaClockRepository,
    BusinessCalendarRepository,
    SlaQueueService,
    AssignmentQueueService,
    MaintenanceQueueService,
    SlaClockService,
    SlaConsumer,
    AssignmentConsumer,
    SlaSweepConsumer,
  ],
  exports: [SlaClockService, AssignmentQueueService, SlaClockRepository],
})
export class SlaModule {}
