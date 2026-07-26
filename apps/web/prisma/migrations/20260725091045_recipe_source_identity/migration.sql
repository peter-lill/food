/*
  Warnings:

  - A unique constraint covering the columns `[sourceKey]` on the table `Recipe` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "ReceiptImport" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Recipe" ADD COLUMN     "sourceKey" TEXT,
ADD COLUMN     "sourceName" TEXT,
ADD COLUMN     "sourceUrl" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Recipe_sourceKey_key" ON "Recipe"("sourceKey");
