-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "ticketId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_ticketId_key" ON "Conversation"("ticketId");

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE SET NULL ON UPDATE CASCADE;
