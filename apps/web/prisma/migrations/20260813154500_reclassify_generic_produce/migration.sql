-- Loose produce is not a packaged grocery product and must not be scored for
-- barcodes, brands, nutrition panels, serving counts or allergen statements.
UPDATE "Product"
SET "productType" = 'GENERIC_PRODUCE'::"ProductType",
    "category" = COALESCE(NULLIF("category", ''), 'Fruit & vegetables'),
    "updatedAt" = NOW()
WHERE "brand" IS NULL
  AND "barcode" IS NULL
  AND lower(trim(COALESCE("canonicalName", "name"))) IN (
    'apple', 'avocado', 'banana', 'bean', 'beetroot', 'broccoli', 'button mushroom',
    'cabbage', 'capsicum', 'carrot', 'cauliflower', 'celery', 'cucumber', 'garlic',
    'ginger', 'grape', 'lemon', 'lettuce', 'lime', 'mango', 'onion', 'orange',
    'pear', 'potato', 'pumpkin', 'spinach', 'sweet potato', 'tomato', 'watermelon', 'zucchini'
  );
