CREATE TABLE "ApkeIngredient" (
  "id" TEXT NOT NULL,
  "canonicalName" TEXT NOT NULL,
  "normalisedName" TEXT NOT NULL,
  "category" TEXT,
  "description" TEXT,
  "insCode" TEXT,
  "additiveClass" TEXT,
  "isAdditive" BOOLEAN NOT NULL DEFAULT false,
  "isCompound" BOOLEAN NOT NULL DEFAULT false,
  "status" TEXT NOT NULL DEFAULT 'VERIFIED',
  "source" TEXT NOT NULL DEFAULT 'APKE_SEED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ApkeIngredient_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ApkeIngredient_normalisedName_key"
  ON "ApkeIngredient"("normalisedName");
CREATE UNIQUE INDEX "ApkeIngredient_insCode_key"
  ON "ApkeIngredient"("insCode")
  WHERE "insCode" IS NOT NULL;
CREATE INDEX "ApkeIngredient_category_idx"
  ON "ApkeIngredient"("category");
CREATE INDEX "ApkeIngredient_status_idx"
  ON "ApkeIngredient"("status");

CREATE TABLE "ApkeIngredientAlias" (
  "id" TEXT NOT NULL,
  "ingredientId" TEXT NOT NULL,
  "alias" TEXT NOT NULL,
  "normalisedAlias" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'APKE_SEED',
  "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ApkeIngredientAlias_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ApkeIngredientAlias_ingredientId_fkey"
    FOREIGN KEY ("ingredientId") REFERENCES "ApkeIngredient"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ApkeIngredientAlias_normalisedAlias_key"
  ON "ApkeIngredientAlias"("normalisedAlias");
CREATE INDEX "ApkeIngredientAlias_ingredientId_idx"
  ON "ApkeIngredientAlias"("ingredientId");

CREATE TABLE "ApkeIngredientAllergen" (
  "id" TEXT NOT NULL,
  "ingredientId" TEXT NOT NULL,
  "allergen" TEXT NOT NULL,
  "relationship" TEXT NOT NULL DEFAULT 'CONTAINS',
  "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "source" TEXT NOT NULL DEFAULT 'APKE_SEED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ApkeIngredientAllergen_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ApkeIngredientAllergen_ingredientId_fkey"
    FOREIGN KEY ("ingredientId") REFERENCES "ApkeIngredient"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ApkeIngredientAllergen_ingredientId_allergen_relationship_key"
  ON "ApkeIngredientAllergen"("ingredientId", "allergen", "relationship");
CREATE INDEX "ApkeIngredientAllergen_allergen_idx"
  ON "ApkeIngredientAllergen"("allergen");

CREATE TABLE "ApkeIngredientDictionaryAudit" (
  "id" TEXT NOT NULL,
  "ingredientId" TEXT,
  "action" TEXT NOT NULL,
  "beforeData" JSONB,
  "afterData" JSONB,
  "source" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ApkeIngredientDictionaryAudit_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ApkeIngredientDictionaryAudit_ingredientId_fkey"
    FOREIGN KEY ("ingredientId") REFERENCES "ApkeIngredient"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "ApkeIngredientDictionaryAudit_ingredientId_createdAt_idx"
  ON "ApkeIngredientDictionaryAudit"("ingredientId", "createdAt");
