-- Earlier identity matching could promote an embedded flavour or ingredient
-- (for example feta in flatbread dippers) to the complete canonical identity.
-- Restore the packaged product identity without enumerating individual brands
-- or flavours; the current identity engine will then derive the form family.
UPDATE "Product"
SET "canonicalName" = "name", "updatedAt" = NOW()
WHERE "canonicalName" IS NOT NULL
  AND lower(trim("canonicalName")) <> lower(trim("name"))
  AND position(lower(trim("canonicalName")) in lower("name")) > 0
  AND lower("name") ~ '\m(flatbreads?|dippers?|crackers?|biscuits?|cookies?|dips?|potato chips?|corn chips?|tortilla chips?|pita chips?)\M';
