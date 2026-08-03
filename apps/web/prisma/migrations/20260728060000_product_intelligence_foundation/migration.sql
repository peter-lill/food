-- CreateEnum
CREATE TYPE "ProductType" AS ENUM (
  'GENERIC_PRODUCE',
  'PACKAGED',
  'FRESH_MEAT',
  'SEAFOOD',
  'DAIRY',
  'BAKERY',
  'FROZEN',
  'HOUSEHOLD',
  'PERSONAL_CARE',
  'BEVERAGE',
  'OTHER'
);

-- CreateEnum
CREATE TYPE "ProductLifecycle" AS ENUM (
  'NEW',
  'MATCHED',
  'ENRICHING',
  'READY',
  'REVIEW_REQUIRED',
  'ARCHIVED'
);

-- CreateEnum
CREATE TYPE "EnrichmentJobStatus" AS ENUM (
  'QUEUED',
  'RUNNING',
  'COMPLETED',
  'FAILED',
  'RETRY_SCHEDULED'
);

-- CreateTable
CREATE TABLE "FoodKnowledge" (
  "id" TEXT NOT NULL,
  "commonName" TEXT NOT NULL,
  "scientificName" TEXT,
  "foodGroup" TEXT,
  "category" TEXT,
  "subCategory" TEXT,
  "description" TEXT,
  "storageGuide" TEXT,
  "seasonality" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "FoodKnowledge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductEnrichmentJob" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "status" "EnrichmentJobStatus" NOT NULL DEFAULT 'QUEUED',
  "priority" INTEGER NOT NULL DEFAULT 100,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "nextRetryAt" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ProductEnrichmentJob_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Product"
  ADD COLUMN "foodKnowledgeId" TEXT,
  ADD COLUMN "productType" "ProductType" NOT NULL DEFAULT 'PACKAGED',
  ADD COLUMN "lifecycle" "ProductLifecycle" NOT NULL DEFAULT 'NEW',
  ADD COLUMN "confidenceScore" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "FoodKnowledge_commonName_key" ON "FoodKnowledge"("commonName");

-- CreateIndex
CREATE INDEX "Product_foodKnowledgeId_idx" ON "Product"("foodKnowledgeId");

-- CreateIndex
CREATE INDEX "Product_productType_lifecycle_idx" ON "Product"("productType", "lifecycle");

-- CreateIndex
CREATE INDEX "ProductEnrichmentJob_status_priority_createdAt_idx"
  ON "ProductEnrichmentJob"("status", "priority", "createdAt");

-- CreateIndex
CREATE INDEX "ProductEnrichmentJob_productId_status_idx"
  ON "ProductEnrichmentJob"("productId", "status");

-- CreateIndex
CREATE INDEX "ProductEnrichmentJob_nextRetryAt_idx"
  ON "ProductEnrichmentJob"("nextRetryAt");

-- AddForeignKey
ALTER TABLE "Product"
  ADD CONSTRAINT "Product_foodKnowledgeId_fkey"
  FOREIGN KEY ("foodKnowledgeId") REFERENCES "FoodKnowledge"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductEnrichmentJob"
  ADD CONSTRAINT "ProductEnrichmentJob_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
