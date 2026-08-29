-- CreateEnum
CREATE TYPE "SlaClockKind" AS ENUM ('FIRST_RESPONSE', 'RESOLUTION');

-- AlterEnum
ALTER TYPE "TicketEventType" ADD VALUE 'SLA_BREACHED';

-- AlterTable
ALTER TABLE "Agent" ADD COLUMN     "lastAssignedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "BusinessCalendar" (
    "id" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "windows" JSONB NOT NULL,
    "holidays" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessCalendar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlaClock" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "kind" "SlaClockKind" NOT NULL,
    "targetMinutes" INTEGER NOT NULL,
    "consumedMinutes" INTEGER NOT NULL DEFAULT 0,
    "activeSince" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "breachedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SlaClock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SlaClock_ticketId_kind_key" ON "SlaClock"("ticketId", "kind");

-- AddForeignKey
ALTER TABLE "SlaClock" ADD CONSTRAINT "SlaClock_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreatePartialIndex
-- Prisma's schema DSL cannot express a partial index, so this is hand-added
-- to the generated migration file (see design.md and sla.prisma, same
-- pattern as Ticket_unassigned_queue_idx in 03-add-ticket-queue). Speeds up
-- both the point-in-time due-job consumer's re-read and the sla:sweep
-- recovery scan (tasks.md 1.4/4.3), which both only ever care about clocks
-- that are still active (not paused, not completed) — completed/paused
-- rows are permanently irrelevant to "what is due" and excluded from the
-- index entirely. Existence verified by
-- libs/db/src/queries/sla-clock-due-index.integration.spec.ts, not just by
-- inspection of this file.
CREATE INDEX "sla_clocks_due_idx" ON "SlaClock"("dueAt") WHERE "completedAt" IS NULL AND "pausedAt" IS NULL;
