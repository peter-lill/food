CREATE TABLE "ProductNutritionPanel" (
  "productId" TEXT NOT NULL,
  "servingsPerPackage" DOUBLE PRECISION,
  "servingSize" TEXT,
  "servingQuantity" DOUBLE PRECISION,
  "servingUnit" TEXT,
  "basisUnit" TEXT NOT NULL DEFAULT 'g',
  "energyKjPerServing" DOUBLE PRECISION,
  "energyKjPer100" DOUBLE PRECISION,
  "proteinGramsPerServing" DOUBLE PRECISION,
  "proteinGramsPer100" DOUBLE PRECISION,
  "fatGramsPerServing" DOUBLE PRECISION,
  "fatGramsPer100" DOUBLE PRECISION,
  "saturatedFatGramsPerServing" DOUBLE PRECISION,
  "saturatedFatGramsPer100" DOUBLE PRECISION,
  "carbsGramsPerServing" DOUBLE PRECISION,
  "carbsGramsPer100" DOUBLE PRECISION,
  "sugarGramsPerServing" DOUBLE PRECISION,
  "sugarGramsPer100" DOUBLE PRECISION,
  "fibreGramsPerServing" DOUBLE PRECISION,
  "fibreGramsPer100" DOUBLE PRECISION,
  "sodiumMgPerServing" DOUBLE PRECISION,
  "sodiumMgPer100" DOUBLE PRECISION,
  "ingredientsText" TEXT,
  "containsAllergens" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "mayContainAllergens" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "source" TEXT,
  "sourceUrl" TEXT,
  "verifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductNutritionPanel_pkey" PRIMARY KEY ("productId"),
  CONSTRAINT "ProductNutritionPanel_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "ProductNutritionPanel" (
  "productId", "servingsPerPackage", "servingSize", "servingQuantity", "servingUnit", "basisUnit",
  "energyKjPerServing", "energyKjPer100", "proteinGramsPerServing", "proteinGramsPer100",
  "fatGramsPerServing", "fatGramsPer100", "saturatedFatGramsPerServing", "saturatedFatGramsPer100",
  "carbsGramsPerServing", "carbsGramsPer100", "sugarGramsPerServing", "sugarGramsPer100",
  "fibreGramsPerServing", "fibreGramsPer100", "sodiumMgPerServing", "sodiumMgPer100",
  "ingredientsText", "containsAllergens", "mayContainAllergens", "source", "verifiedAt"
)
SELECT
  p."id", p."servingsPerPackage", p."servingSize", p."servingQuantity", p."servingUnit",
  CASE WHEN p."servingUnit" = 'mL' THEN 'mL' ELSE 'g' END,
  CASE WHEN p."calories" IS NOT NULL AND p."servingQuantity" IS NOT NULL AND p."servingUnit" IN ('g','mL') THEN p."calories" * 4.184 * p."servingQuantity" / 100 END,
  p."calories" * 4.184,
  CASE WHEN p."proteinGrams" IS NOT NULL AND p."servingQuantity" IS NOT NULL AND p."servingUnit" IN ('g','mL') THEN p."proteinGrams" * p."servingQuantity" / 100 END, p."proteinGrams",
  CASE WHEN p."fatGrams" IS NOT NULL AND p."servingQuantity" IS NOT NULL AND p."servingUnit" IN ('g','mL') THEN p."fatGrams" * p."servingQuantity" / 100 END, p."fatGrams",
  CASE WHEN p."saturatedFatGrams" IS NOT NULL AND p."servingQuantity" IS NOT NULL AND p."servingUnit" IN ('g','mL') THEN p."saturatedFatGrams" * p."servingQuantity" / 100 END, p."saturatedFatGrams",
  CASE WHEN p."carbsGrams" IS NOT NULL AND p."servingQuantity" IS NOT NULL AND p."servingUnit" IN ('g','mL') THEN p."carbsGrams" * p."servingQuantity" / 100 END, p."carbsGrams",
  CASE WHEN p."sugarGrams" IS NOT NULL AND p."servingQuantity" IS NOT NULL AND p."servingUnit" IN ('g','mL') THEN p."sugarGrams" * p."servingQuantity" / 100 END, p."sugarGrams",
  CASE WHEN p."fibreGrams" IS NOT NULL AND p."servingQuantity" IS NOT NULL AND p."servingUnit" IN ('g','mL') THEN p."fibreGrams" * p."servingQuantity" / 100 END, p."fibreGrams",
  CASE WHEN p."sodiumMg" IS NOT NULL AND p."servingQuantity" IS NOT NULL AND p."servingUnit" IN ('g','mL') THEN p."sodiumMg" * p."servingQuantity" / 100 END, p."sodiumMg",
  p."ingredientsText", p."allergens", p."mayContainAllergens", 'Legacy product record', p."updatedAt"
FROM "Product" p
WHERE p."servingSize" IS NOT NULL OR p."servingsPerPackage" IS NOT NULL OR p."calories" IS NOT NULL OR p."ingredientsText" IS NOT NULL;

CREATE INDEX "ProductNutritionPanel_verifiedAt_idx" ON "ProductNutritionPanel"("verifiedAt");