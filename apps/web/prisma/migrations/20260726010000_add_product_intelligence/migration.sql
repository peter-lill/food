-- Food v2 Product Intelligence foundation.
-- All links from existing records are nullable so the migration is non-destructive.

ALTER TABLE "Product"
  ADD COLUMN "canonicalName" TEXT,
  ADD COLUMN "slug" TEXT,
  ADD COLUMN "category" TEXT,
  ADD COLUMN "description" TEXT,
  ADD COLUMN "imageUrl" TEXT,
  ADD COLUMN "packSize" TEXT,
  ADD COLUMN "packQuantity" DOUBLE PRECISION,
  ADD COLUMN "packUnit" TEXT,
  ADD COLUMN "calories" DOUBLE PRECISION,
  ADD COLUMN "proteinGrams" DOUBLE PRECISION,
  ADD COLUMN "carbsGrams" DOUBLE PRECISION,
  ADD COLUMN "fatGrams" DOUBLE PRECISION,
  ADD COLUMN "saturatedFatGrams" DOUBLE PRECISION,
  ADD COLUMN "fibreGrams" DOUBLE PRECISION,
  ADD COLUMN "sugarGrams" DOUBLE PRECISION,
  ADD COLUMN "sodiumMg" DOUBLE PRECISION,
  ADD COLUMN "allergens" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "dietaryTags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE UNIQUE INDEX "Product_slug_key" ON "Product"("slug");

ALTER TABLE "Ingredient" ADD COLUMN "productId" TEXT;
ALTER TABLE "ShoppingItem" ADD COLUMN "productId" TEXT;
ALTER TABLE "ReceiptItem" ADD COLUMN "productId" TEXT;
ALTER TABLE "SupermarketPrice" ADD COLUMN "productId" TEXT;

CREATE TABLE "ProductAlias" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "alias" TEXT NOT NULL,
  "normalised" TEXT NOT NULL,
  "source" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductAlias_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductAlias_normalised_key" ON "ProductAlias"("normalised");
CREATE INDEX "ProductAlias_productId_idx" ON "ProductAlias"("productId");

CREATE TABLE "StoreProduct" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "retailer" TEXT NOT NULL,
  "externalId" TEXT,
  "retailerProductName" TEXT NOT NULL,
  "brand" TEXT,
  "packSize" TEXT,
  "packQuantity" DOUBLE PRECISION,
  "packUnit" TEXT,
  "productUrl" TEXT,
  "imageUrl" TEXT,
  "aisle" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "lastSeenAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StoreProduct_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StoreProduct_retailer_externalId_key"
  ON "StoreProduct"("retailer", "externalId");
CREATE INDEX "StoreProduct_productId_retailer_idx"
  ON "StoreProduct"("productId", "retailer");
CREATE INDEX "StoreProduct_retailer_retailerProductName_idx"
  ON "StoreProduct"("retailer", "retailerProductName");

CREATE TABLE "PriceObservation" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "storeProductId" TEXT,
  "retailer" TEXT NOT NULL,
  "price" DOUBLE PRECISION NOT NULL,
  "unitPrice" DOUBLE PRECISION,
  "unitLabel" TEXT,
  "isSpecial" BOOLEAN NOT NULL DEFAULT false,
  "source" TEXT NOT NULL,
  "sourceUrl" TEXT,
  "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PriceObservation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PriceObservation_productId_observedAt_idx"
  ON "PriceObservation"("productId", "observedAt");
CREATE INDEX "PriceObservation_retailer_observedAt_idx"
  ON "PriceObservation"("retailer", "observedAt");
CREATE INDEX "PriceObservation_storeProductId_observedAt_idx"
  ON "PriceObservation"("storeProductId", "observedAt");

CREATE INDEX "Ingredient_productId_idx" ON "Ingredient"("productId");
CREATE INDEX "ShoppingItem_productId_idx" ON "ShoppingItem"("productId");
CREATE INDEX "ReceiptItem_productId_idx" ON "ReceiptItem"("productId");
CREATE INDEX "SupermarketPrice_productId_checkedAt_idx"
  ON "SupermarketPrice"("productId", "checkedAt");

ALTER TABLE "ProductAlias"
  ADD CONSTRAINT "ProductAlias_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StoreProduct"
  ADD CONSTRAINT "StoreProduct_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PriceObservation"
  ADD CONSTRAINT "PriceObservation_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PriceObservation"
  ADD CONSTRAINT "PriceObservation_storeProductId_fkey"
  FOREIGN KEY ("storeProductId") REFERENCES "StoreProduct"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Ingredient"
  ADD CONSTRAINT "Ingredient_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ShoppingItem"
  ADD CONSTRAINT "ShoppingItem_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ReceiptItem"
  ADD CONSTRAINT "ReceiptItem_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SupermarketPrice"
  ADD CONSTRAINT "SupermarketPrice_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
