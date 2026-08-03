-- Australian Product Knowledge Engine backend foundation

CREATE TYPE "GtinIdentityStatus" AS ENUM ('VERIFIED', 'PROVISIONAL', 'CONFLICT', 'RETIRED');
CREATE TYPE "ProductRepairStatus" AS ENUM ('QUEUED', 'RUNNING', 'REVIEW_REQUIRED', 'COMPLETED', 'FAILED');

CREATE TABLE "ProductGtinIdentity" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "gtin" TEXT NOT NULL,
  "status" "GtinIdentityStatus" NOT NULL DEFAULT 'PROVISIONAL',
  "canonicalName" TEXT,
  "brand" TEXT,
  "packSize" TEXT,
  "source" TEXT,
  "sourceUrl" TEXT,
  "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "verifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductGtinIdentity_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProductGtinIdentity_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProductGtinIdentity_gtin_format" CHECK ("gtin" ~ '^[0-9]{8,14}$'),
  CONSTRAINT "ProductGtinIdentity_confidence_range" CHECK ("confidence" >= 0 AND "confidence" <= 1)
);
CREATE UNIQUE INDEX "ProductGtinIdentity_gtin_key" ON "ProductGtinIdentity"("gtin");
CREATE UNIQUE INDEX "ProductGtinIdentity_productId_key" ON "ProductGtinIdentity"("productId");
CREATE INDEX "ProductGtinIdentity_status_idx" ON "ProductGtinIdentity"("status");

CREATE TABLE "ProductFieldProvenance" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "field" TEXT NOT NULL,
  "valueHash" TEXT,
  "source" TEXT NOT NULL,
  "sourceUrl" TEXT,
  "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "derived" BOOLEAN NOT NULL DEFAULT false,
  "verifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductFieldProvenance_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProductFieldProvenance_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProductFieldProvenance_confidence_range" CHECK ("confidence" >= 0 AND "confidence" <= 1)
);
CREATE UNIQUE INDEX "ProductFieldProvenance_productId_field_key" ON "ProductFieldProvenance"("productId", "field");
CREATE INDEX "ProductFieldProvenance_source_idx" ON "ProductFieldProvenance"("source");

CREATE TABLE "ProductQualitySnapshot" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "identityScore" INTEGER NOT NULL DEFAULT 0,
  "nutritionScore" INTEGER NOT NULL DEFAULT 0,
  "labelScore" INTEGER NOT NULL DEFAULT 0,
  "retailScore" INTEGER NOT NULL DEFAULT 0,
  "imageScore" INTEGER NOT NULL DEFAULT 0,
  "overallScore" INTEGER NOT NULL DEFAULT 0,
  "missingFields" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "issues" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductQualitySnapshot_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProductQualitySnapshot_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProductQualitySnapshot_score_range" CHECK (
    "identityScore" BETWEEN 0 AND 100 AND "nutritionScore" BETWEEN 0 AND 100 AND
    "labelScore" BETWEEN 0 AND 100 AND "retailScore" BETWEEN 0 AND 100 AND
    "imageScore" BETWEEN 0 AND 100 AND "overallScore" BETWEEN 0 AND 100
  )
);
CREATE UNIQUE INDEX "ProductQualitySnapshot_productId_key" ON "ProductQualitySnapshot"("productId");
CREATE INDEX "ProductQualitySnapshot_overallScore_idx" ON "ProductQualitySnapshot"("overallScore");

CREATE TABLE "ProductRepairItem" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "status" "ProductRepairStatus" NOT NULL DEFAULT 'QUEUED',
  "priority" INTEGER NOT NULL DEFAULT 100,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "nextAttemptAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "ProductRepairItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProductRepairItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ProductRepairItem_productId_reason_active_key" ON "ProductRepairItem"("productId", "reason") WHERE "status" IN ('QUEUED', 'RUNNING', 'REVIEW_REQUIRED');
CREATE INDEX "ProductRepairItem_status_priority_idx" ON "ProductRepairItem"("status", "priority", "createdAt");

CREATE TABLE "ProductAuditEvent" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "source" TEXT,
  "summary" TEXT NOT NULL,
  "before" JSONB,
  "after" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductAuditEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProductAuditEvent_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ProductAuditEvent_productId_createdAt_idx" ON "ProductAuditEvent"("productId", "createdAt" DESC);

-- Backfill current valid barcodes as provisional GTIN identities.
INSERT INTO "ProductGtinIdentity" (
  "id", "productId", "gtin", "status", "canonicalName", "brand", "packSize", "source", "confidence", "verifiedAt"
)
SELECT
  'gtin_' || md5("id" || ':' || "barcode"), "id", "barcode", 'PROVISIONAL', COALESCE("canonicalName", "name"), "brand", "packSize", 'legacy-product',
  CASE WHEN "confidenceScore" BETWEEN 0 AND 1 THEN "confidenceScore" ELSE 0 END,
  "updatedAt"
FROM "Product"
WHERE "barcode" ~ '^[0-9]{8,14}$'
ON CONFLICT ("gtin") DO NOTHING;
