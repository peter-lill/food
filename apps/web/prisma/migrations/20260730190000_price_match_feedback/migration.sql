CREATE TABLE "PriceMatchFeedback" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "shoppingItemId" TEXT NOT NULL,
  "productId" TEXT,
  "retailer" TEXT NOT NULL,
  "candidateKey" TEXT NOT NULL,
  "productName" TEXT NOT NULL,
  "sourceUrl" TEXT,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PriceMatchFeedback_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PriceMatchFeedback_userId_shoppingItemId_candidateKey_key"
  ON "PriceMatchFeedback"("userId", "shoppingItemId", "candidateKey");
CREATE INDEX "PriceMatchFeedback_userId_shoppingItemId_idx"
  ON "PriceMatchFeedback"("userId", "shoppingItemId");
CREATE INDEX "PriceMatchFeedback_productId_retailer_idx"
  ON "PriceMatchFeedback"("productId", "retailer");
