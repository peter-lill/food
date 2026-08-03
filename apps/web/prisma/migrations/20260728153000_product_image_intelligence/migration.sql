CREATE TABLE "ProductImageCandidate" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "sourceLabel" TEXT,
  "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "width" INTEGER,
  "height" INTEGER,
  "contentType" TEXT,
  "contentLength" INTEGER,
  "selected" BOOLEAN NOT NULL DEFAULT false,
  "rejected" BOOLEAN NOT NULL DEFAULT false,
  "lastCheckedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductImageCandidate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductImageCandidate_productId_url_key"
  ON "ProductImageCandidate"("productId", "url");
CREATE INDEX "ProductImageCandidate_productId_score_idx"
  ON "ProductImageCandidate"("productId", "score" DESC);
CREATE INDEX "ProductImageCandidate_productId_rejected_idx"
  ON "ProductImageCandidate"("productId", "rejected");

ALTER TABLE "ProductImageCandidate"
  ADD CONSTRAINT "ProductImageCandidate_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
