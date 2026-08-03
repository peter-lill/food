CREATE OR REPLACE FUNCTION sync_product_nutrition_panel()
RETURNS TRIGGER AS $$
DECLARE
  factor DOUBLE PRECISION;
  basis TEXT;
BEGIN
  factor := CASE
    WHEN NEW."servingQuantity" IS NOT NULL AND NEW."servingUnit" IN ('g', 'mL')
      THEN NEW."servingQuantity" / 100.0
    ELSE NULL
  END;
  basis := CASE WHEN NEW."servingUnit" = 'mL' THEN 'mL' ELSE 'g' END;

  IF NEW."servingSize" IS NULL
     AND NEW."servingsPerPackage" IS NULL
     AND NEW."calories" IS NULL
     AND NEW."proteinGrams" IS NULL
     AND NEW."carbsGrams" IS NULL
     AND NEW."fatGrams" IS NULL
     AND NEW."saturatedFatGrams" IS NULL
     AND NEW."fibreGrams" IS NULL
     AND NEW."sugarGrams" IS NULL
     AND NEW."sodiumMg" IS NULL
     AND NEW."ingredientsText" IS NULL
     AND cardinality(NEW."allergens") = 0
     AND cardinality(NEW."mayContainAllergens") = 0 THEN
    RETURN NEW;
  END IF;

  INSERT INTO "ProductNutritionPanel" (
    "productId", "servingsPerPackage", "servingSize", "servingQuantity", "servingUnit", "basisUnit",
    "energyKjPerServing", "energyKjPer100", "proteinGramsPerServing", "proteinGramsPer100",
    "fatGramsPerServing", "fatGramsPer100", "saturatedFatGramsPerServing", "saturatedFatGramsPer100",
    "carbsGramsPerServing", "carbsGramsPer100", "sugarGramsPerServing", "sugarGramsPer100",
    "fibreGramsPerServing", "fibreGramsPer100", "sodiumMgPerServing", "sodiumMgPer100",
    "ingredientsText", "containsAllergens", "mayContainAllergens", "source", "verifiedAt", "updatedAt"
  ) VALUES (
    NEW."id", NEW."servingsPerPackage", NEW."servingSize", NEW."servingQuantity", NEW."servingUnit", basis,
    CASE WHEN factor IS NULL OR NEW."calories" IS NULL THEN NULL ELSE NEW."calories" * 4.184 * factor END,
    CASE WHEN NEW."calories" IS NULL THEN NULL ELSE NEW."calories" * 4.184 END,
    CASE WHEN factor IS NULL THEN NULL ELSE NEW."proteinGrams" * factor END, NEW."proteinGrams",
    CASE WHEN factor IS NULL THEN NULL ELSE NEW."fatGrams" * factor END, NEW."fatGrams",
    CASE WHEN factor IS NULL THEN NULL ELSE NEW."saturatedFatGrams" * factor END, NEW."saturatedFatGrams",
    CASE WHEN factor IS NULL THEN NULL ELSE NEW."carbsGrams" * factor END, NEW."carbsGrams",
    CASE WHEN factor IS NULL THEN NULL ELSE NEW."sugarGrams" * factor END, NEW."sugarGrams",
    CASE WHEN factor IS NULL THEN NULL ELSE NEW."fibreGrams" * factor END, NEW."fibreGrams",
    CASE WHEN factor IS NULL THEN NULL ELSE NEW."sodiumMg" * factor END, NEW."sodiumMg",
    NEW."ingredientsText", NEW."allergens", NEW."mayContainAllergens", 'Product enrichment pipeline', NEW."updatedAt", CURRENT_TIMESTAMP
  )
  ON CONFLICT ("productId") DO UPDATE SET
    "servingsPerPackage" = COALESCE(EXCLUDED."servingsPerPackage", "ProductNutritionPanel"."servingsPerPackage"),
    "servingSize" = COALESCE(EXCLUDED."servingSize", "ProductNutritionPanel"."servingSize"),
    "servingQuantity" = COALESCE(EXCLUDED."servingQuantity", "ProductNutritionPanel"."servingQuantity"),
    "servingUnit" = COALESCE(EXCLUDED."servingUnit", "ProductNutritionPanel"."servingUnit"),
    "basisUnit" = EXCLUDED."basisUnit",
    "energyKjPerServing" = COALESCE(EXCLUDED."energyKjPerServing", "ProductNutritionPanel"."energyKjPerServing"),
    "energyKjPer100" = COALESCE(EXCLUDED."energyKjPer100", "ProductNutritionPanel"."energyKjPer100"),
    "proteinGramsPerServing" = COALESCE(EXCLUDED."proteinGramsPerServing", "ProductNutritionPanel"."proteinGramsPerServing"),
    "proteinGramsPer100" = COALESCE(EXCLUDED."proteinGramsPer100", "ProductNutritionPanel"."proteinGramsPer100"),
    "fatGramsPerServing" = COALESCE(EXCLUDED."fatGramsPerServing", "ProductNutritionPanel"."fatGramsPerServing"),
    "fatGramsPer100" = COALESCE(EXCLUDED."fatGramsPer100", "ProductNutritionPanel"."fatGramsPer100"),
    "saturatedFatGramsPerServing" = COALESCE(EXCLUDED."saturatedFatGramsPerServing", "ProductNutritionPanel"."saturatedFatGramsPerServing"),
    "saturatedFatGramsPer100" = COALESCE(EXCLUDED."saturatedFatGramsPer100", "ProductNutritionPanel"."saturatedFatGramsPer100"),
    "carbsGramsPerServing" = COALESCE(EXCLUDED."carbsGramsPerServing", "ProductNutritionPanel"."carbsGramsPerServing"),
    "carbsGramsPer100" = COALESCE(EXCLUDED."carbsGramsPer100", "ProductNutritionPanel"."carbsGramsPer100"),
    "sugarGramsPerServing" = COALESCE(EXCLUDED."sugarGramsPerServing", "ProductNutritionPanel"."sugarGramsPerServing"),
    "sugarGramsPer100" = COALESCE(EXCLUDED."sugarGramsPer100", "ProductNutritionPanel"."sugarGramsPer100"),
    "fibreGramsPerServing" = COALESCE(EXCLUDED."fibreGramsPerServing", "ProductNutritionPanel"."fibreGramsPerServing"),
    "fibreGramsPer100" = COALESCE(EXCLUDED."fibreGramsPer100", "ProductNutritionPanel"."fibreGramsPer100"),
    "sodiumMgPerServing" = COALESCE(EXCLUDED."sodiumMgPerServing", "ProductNutritionPanel"."sodiumMgPerServing"),
    "sodiumMgPer100" = COALESCE(EXCLUDED."sodiumMgPer100", "ProductNutritionPanel"."sodiumMgPer100"),
    "ingredientsText" = COALESCE(EXCLUDED."ingredientsText", "ProductNutritionPanel"."ingredientsText"),
    "containsAllergens" = CASE WHEN cardinality(EXCLUDED."containsAllergens") > 0 THEN EXCLUDED."containsAllergens" ELSE "ProductNutritionPanel"."containsAllergens" END,
    "mayContainAllergens" = CASE WHEN cardinality(EXCLUDED."mayContainAllergens") > 0 THEN EXCLUDED."mayContainAllergens" ELSE "ProductNutritionPanel"."mayContainAllergens" END,
    "source" = EXCLUDED."source",
    "verifiedAt" = EXCLUDED."verifiedAt",
    "updatedAt" = CURRENT_TIMESTAMP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "Product_sync_nip" ON "Product";
CREATE TRIGGER "Product_sync_nip"
AFTER INSERT OR UPDATE OF
  "servingsPerPackage", "servingSize", "servingQuantity", "servingUnit",
  "calories", "proteinGrams", "carbsGrams", "fatGrams", "saturatedFatGrams",
  "fibreGrams", "sugarGrams", "sodiumMg", "ingredientsText", "allergens", "mayContainAllergens"
ON "Product"
FOR EACH ROW EXECUTE FUNCTION sync_product_nutrition_panel();