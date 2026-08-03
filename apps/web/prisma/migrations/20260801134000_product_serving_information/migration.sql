ALTER TABLE "Product"
  ADD COLUMN "servingSize" TEXT,
  ADD COLUMN "servingQuantity" DOUBLE PRECISION,
  ADD COLUMN "servingUnit" TEXT,
  ADD COLUMN "servingsPerPackage" DOUBLE PRECISION;

ALTER TABLE "Product"
  ADD CONSTRAINT "Product_servingQuantity_positive" CHECK ("servingQuantity" IS NULL OR "servingQuantity" > 0),
  ADD CONSTRAINT "Product_servingsPerPackage_positive" CHECK ("servingsPerPackage" IS NULL OR "servingsPerPackage" > 0);
