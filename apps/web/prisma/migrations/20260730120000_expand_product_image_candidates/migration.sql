ALTER TABLE "ProductImageCandidate"
  ADD COLUMN IF NOT EXISTS "width" INTEGER,
  ADD COLUMN IF NOT EXISTS "height" INTEGER,
  ADD COLUMN IF NOT EXISTS "contentType" TEXT,
  ADD COLUMN IF NOT EXISTS "fileSizeBytes" INTEGER,
  ADD COLUMN IF NOT EXISTS "qualityScore" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "identityScore" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "providerScore" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "overallScore" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "accepted" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "rejectionReasons" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "lastCheckedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS "ProductImageCandidate_productId_overallScore_idx"
  ON "ProductImageCandidate"("productId", "overallScore" DESC);

CREATE INDEX IF NOT EXISTS "ProductImageCandidate_productId_selected_idx"
  ON "ProductImageCandidate"("productId", "selected");

CREATE INDEX IF NOT EXISTS "ProductImageCandidate_productId_rejected_idx"
  ON "ProductImageCandidate"("productId", "rejected");
