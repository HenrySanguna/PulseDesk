-- AlterTable
ALTER TABLE "SlaPolicy" ADD COLUMN     "priority" "TicketPriority" NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "SlaPolicy_priority_key" ON "SlaPolicy"("priority");
