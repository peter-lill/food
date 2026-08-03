CREATE TABLE IF NOT EXISTS "ImageAsset" (
  "id" TEXT NOT NULL,
  "sha256" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "fileSizeBytes" INTEGER NOT NULL,
  "width" INTEGER,
  "height" INTEGER,
  "storagePath" TEXT NOT NULL,
  "originalUrl" TEXT,
  "provider" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ImageAsset_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ImageAsset_sha256_key" ON "ImageAsset"("sha256");
CREATE UNIQUE INDEX IF NOT EXISTS "ImageAsset_storagePath_key" ON "ImageAsset"("storagePath");
CREATE INDEX IF NOT EXISTS "ImageAsset_provider_createdAt_idx" ON "ImageAsset"("provider", "createdAt");

ALTER TABLE "Product"
  ADD COLUMN IF NOT EXISTS "primaryImageAssetId" TEXT;

ALTER TABLE "ProductImageCandidate"
  ADD COLUMN IF NOT EXISTS "assetId" TEXT;

CREATE INDEX IF NOT EXISTS "Product_primaryImageAssetId_idx" ON "Product"("primaryImageAssetId");
CREATE INDEX IF NOT EXISTS "ProductImageCandidate_assetId_idx" ON "ProductImageCandidate"("assetId");

DO $$ BEGIN
  ALTER TABLE "Product"
    ADD CONSTRAINT "Product_primaryImageAssetId_fkey"
    FOREIGN KEY ("primaryImageAssetId") REFERENCES "ImageAsset"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ProductImageCandidate"
    ADD CONSTRAINT "ProductImageCandidate_assetId_fkey"
    FOREIGN KEY ("assetId") REFERENCES "ImageAsset"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
