-- CreateEnum
CREATE TYPE "ReceiptStatus" AS ENUM ('DRAFT', 'IMPORTED', 'CANCELLED');

-- AlterTable
ALTER TABLE "ReceiptImport"
ADD COLUMN "fingerprint" TEXT,
ADD COLUMN "status" "ReceiptStatus" NOT NULL DEFAULT 'DRAFT',
ADD COLUMN "importedAt" TIMESTAMP(3),
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "ReceiptItem"
ADD COLUMN "unit" TEXT,
ADD COLUMN "location" "InventoryLocation",
ADD COLUMN "expiresAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "ReceiptImport_fingerprint_key" ON "ReceiptImport"("fingerprint");

-- CreateIndex
CREATE INDEX "ReceiptImport_status_createdAt_idx" ON "ReceiptImport"("status", "createdAt");
