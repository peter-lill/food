UPDATE "ProductImageCandidate" pic
SET "selected" = false, "rejected" = true, "updatedAt" = NOW()
FROM "Product" p
WHERE pic."productId" = p."id"
  AND pic."source" = 'OpenAI generated'
  AND (
    p."productType" <> 'GENERIC_PRODUCE'::"ProductType"
    OR COALESCE(p."category", '') !~* '^(fruit[[:space:]]*(&|and)[[:space:]]*vegetables|fresh produce|produce)$'
  );

UPDATE "Product"
SET "imageUrl" = NULL,
    "primaryImageAssetId" = NULL,
    "lifecycle" = 'REVIEW_REQUIRED'::"ProductLifecycle",
    "updatedAt" = NOW()
WHERE "imageUrl" LIKE 'generated://openai/%'
  AND (
    "productType" <> 'GENERIC_PRODUCE'::"ProductType"
    OR COALESCE("category", '') !~* '^(fruit[[:space:]]*(&|and)[[:space:]]*vegetables|fresh produce|produce)$'
  );

UPDATE "Product"
SET "lifecycle" = 'ARCHIVED'::"ProductLifecycle", "updatedAt" = NOW()
WHERE lower(trim("name")) IN ('to serve', 'for serving', 'for garnish', 'optional', 'as needed')
  AND "barcode" IS NULL
  AND "brand" IS NULL;

UPDATE "Product"
SET "canonicalName" = 'Vegetable Stock Cube', "updatedAt" = NOW()
WHERE lower("name") ~ '^vegetable stock (made|prepared) (from|with) (an? )?(low([ -]?salt)? )?(vegetable )?stock cubes?$';
