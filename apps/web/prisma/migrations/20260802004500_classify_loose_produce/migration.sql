UPDATE "Product"
SET "productType" = 'GENERIC_PRODUCE'
WHERE "barcode" IS NULL
  AND (
    LOWER(COALESCE("category", '')) IN ('fruit & vegetables', 'fruit and vegetables', 'fresh produce', 'produce')
    OR LOWER(COALESCE("name", '')) ~ '\m(apple|apples|banana|bananas|orange|oranges|lemon|lemons|lime|limes|carrot|carrots|broccoli|mushroom|mushrooms|potato|potatoes|onion|onions|tomato|tomatoes|avocado|avocados|capsicum|cucumber|lettuce|spinach|sweet potato|sweet potatoes)\M'
  );
