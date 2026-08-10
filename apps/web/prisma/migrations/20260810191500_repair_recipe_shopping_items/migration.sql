-- Repair Shopping items produced by the former recipe ingredient parser.
-- Conditions include the malformed name, quantity and unit so ordinary user-entered items remain untouched.
UPDATE "ShoppingItem"
SET "name" = 'Garlic'
WHERE lower(trim("name")) IN ('clove of garlic', 'clove of garlic and')
  AND "quantity" = 1
  AND lower(coalesce("unit", '')) IN ('each', 'item', 'items');

UPDATE "ShoppingItem"
SET "name" = 'Fat free Greek Style Natural Yoghurt', "quantity" = 80, "unit" = 'g'
WHERE lower(trim("name")) = 'fat greek style natural yoghurt mixed with dill'
  AND "quantity" = 80
  AND lower(coalesce("unit", '')) IN ('tbsp', 'tablespoon', 'tablespoons');

UPDATE "ShoppingItem"
SET "name" = 'Reduced fat Soft Cheese', "quantity" = 60, "unit" = 'g'
WHERE lower(trim("name")) = 'low soft cheese'
  AND "quantity" = 60
  AND lower(coalesce("unit", '')) IN ('each', 'item', 'items');

UPDATE "ShoppingItem"
SET "quantity" = 200, "unit" = 'g'
WHERE lower(trim("name")) IN ('beetroot', 'beetroot and', 'pearl barley')
  AND "quantity" = 200
  AND lower(coalesce("unit", '')) IN ('each', 'item', 'items');

UPDATE "ShoppingItem"
SET "name" = 'Pecans or Hazelnuts', "quantity" = 20, "unit" = 'g'
WHERE lower(trim("name")) = 'pecans or hazelnuts'
  AND "quantity" = 20
  AND lower(coalesce("unit", '')) IN ('each', 'item', 'items');

UPDATE "ShoppingItem"
SET "quantity" = 50, "unit" = 'g'
WHERE lower(trim("name")) = 'rocket'
  AND "quantity" = 50
  AND lower(coalesce("unit", '')) IN ('each', 'item', 'items');

UPDATE "ShoppingItem"
SET "name" = 'Vegetable Stock', "quantity" = 500, "unit" = 'ml'
WHERE lower(trim("name")) = 'vegetable stock made from a low stock cube'
  AND "quantity" = 500
  AND lower(coalesce("unit", '')) IN ('each', 'item', 'items');

DELETE FROM "ShoppingItem"
WHERE "productId" IS NULL
  AND lower(trim("name")) = 'to serve'
  AND "quantity" IS NULL;
