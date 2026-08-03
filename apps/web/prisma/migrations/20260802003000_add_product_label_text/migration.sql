ALTER TABLE "Product"
ADD COLUMN "ingredientsText" TEXT,
ADD COLUMN "mayContainAllergens" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
