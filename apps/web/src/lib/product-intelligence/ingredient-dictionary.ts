import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type IngredientDictionaryEntry = {
  canonicalName: string;
  category?: string;
  description?: string;
  insCode?: string;
  additiveClass?: string;
  isAdditive?: boolean;
  isCompound?: boolean;
  aliases?: string[];
  allergens?: string[];
};

export type ResolvedIngredient = {
  id: string;
  canonicalName: string;
  category: string | null;
  insCode: string | null;
  additiveClass: string | null;
  isAdditive: boolean;
  matchedBy: "canonical" | "alias" | "ins";
  confidence: number;
  allergens: string[];
};

type IngredientRow = {
  id: string;
  canonicalName: string;
  category: string | null;
  insCode: string | null;
  additiveClass: string | null;
  isAdditive: boolean;
};

export function normaliseIngredientName(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[–—]/g, "-")
    .replace(/\b(?:ingredients?|contains?)\s*:\s*/gi, "")
    .replace(/\b(?:emulsifier|colour|preservative|antioxidant|raising agent|thickener|stabiliser|acidity regulator|flavour enhancer)\s*\(([^)]+)\)/gi, "$1")
    .replace(/\((?:ins\s*)?([0-9]{3,4}[a-z]?)\)/gi, " $1 ")
    .replace(/[^a-zA-Z0-9%]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("en-AU");
}

function cuidLike(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

async function allergensForIngredient(ingredientId: string) {
  const rows = await prisma.$queryRaw<Array<{ allergen: string }>>(Prisma.sql`
    SELECT "allergen"
    FROM "ApkeIngredientAllergen"
    WHERE "ingredientId" = ${ingredientId}
      AND "relationship" = 'CONTAINS'
    ORDER BY "allergen"
  `).catch(() => []);
  return rows.map((row) => row.allergen);
}

export async function resolveIngredient(value: string): Promise<ResolvedIngredient | null> {
  const normalised = normaliseIngredientName(value);
  if (!normalised) return null;
  const insMatch = normalised.match(/(?:^|\s)([0-9]{3,4}[a-z]?)(?:\s|$)/i)?.[1]?.toUpperCase() ?? null;

  const rows = await prisma.$queryRaw<Array<IngredientRow & { matchedBy: "canonical" | "alias" | "ins"; confidence: number }>>(Prisma.sql`
    SELECT i."id", i."canonicalName", i."category", i."insCode", i."additiveClass", i."isAdditive",
           CASE
             WHEN i."normalisedName" = ${normalised} THEN 'canonical'
             WHEN a."normalisedAlias" = ${normalised} THEN 'alias'
             ELSE 'ins'
           END AS "matchedBy",
           CASE
             WHEN i."normalisedName" = ${normalised} THEN 1.0
             WHEN a."normalisedAlias" = ${normalised} THEN a."confidence"
             ELSE 0.98
           END AS "confidence"
    FROM "ApkeIngredient" i
    LEFT JOIN "ApkeIngredientAlias" a ON a."ingredientId" = i."id"
    WHERE i."normalisedName" = ${normalised}
       OR a."normalisedAlias" = ${normalised}
       OR (${insMatch}::text IS NOT NULL AND UPPER(i."insCode") = ${insMatch})
    ORDER BY "confidence" DESC
    LIMIT 1
  `).catch(() => []);

  const row = rows[0];
  if (!row) return null;
  return { ...row, allergens: await allergensForIngredient(row.id) };
}

export async function upsertIngredientDictionaryEntry(
  entry: IngredientDictionaryEntry,
  source = "APKE_SEED",
) {
  const normalisedName = normaliseIngredientName(entry.canonicalName);
  if (!normalisedName) throw new Error("Ingredient canonical name is required");

  return prisma.$transaction(async (tx) => {
    const existing = await tx.$queryRaw<IngredientRow[]>(Prisma.sql`
      SELECT "id", "canonicalName", "category", "insCode", "additiveClass", "isAdditive"
      FROM "ApkeIngredient"
      WHERE "normalisedName" = ${normalisedName}
         OR (${entry.insCode ?? null}::text IS NOT NULL AND "insCode" = ${entry.insCode ?? null})
      LIMIT 1
    `);
    const ingredientId = existing[0]?.id ?? cuidLike("ing");

    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "ApkeIngredient" (
        "id", "canonicalName", "normalisedName", "category", "description", "insCode",
        "additiveClass", "isAdditive", "isCompound", "status", "source", "updatedAt"
      ) VALUES (
        ${ingredientId}, ${entry.canonicalName.trim()}, ${normalisedName}, ${entry.category ?? null},
        ${entry.description ?? null}, ${entry.insCode ?? null}, ${entry.additiveClass ?? null},
        ${entry.isAdditive ?? Boolean(entry.insCode)}, ${entry.isCompound ?? false}, 'VERIFIED', ${source}, NOW()
      )
      ON CONFLICT ("normalisedName") DO UPDATE SET
        "canonicalName" = EXCLUDED."canonicalName",
        "category" = COALESCE(EXCLUDED."category", "ApkeIngredient"."category"),
        "description" = COALESCE(EXCLUDED."description", "ApkeIngredient"."description"),
        "insCode" = COALESCE(EXCLUDED."insCode", "ApkeIngredient"."insCode"),
        "additiveClass" = COALESCE(EXCLUDED."additiveClass", "ApkeIngredient"."additiveClass"),
        "isAdditive" = EXCLUDED."isAdditive",
        "isCompound" = EXCLUDED."isCompound",
        "source" = EXCLUDED."source",
        "updatedAt" = NOW()
    `);

    for (const alias of new Set(entry.aliases ?? [])) {
      const normalisedAlias = normaliseIngredientName(alias);
      if (!normalisedAlias || normalisedAlias === normalisedName) continue;
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "ApkeIngredientAlias" (
          "id", "ingredientId", "alias", "normalisedAlias", "source", "confidence"
        ) VALUES (${cuidLike("alias")}, ${ingredientId}, ${alias.trim()}, ${normalisedAlias}, ${source}, 1)
        ON CONFLICT ("normalisedAlias") DO UPDATE SET
          "ingredientId" = EXCLUDED."ingredientId",
          "alias" = EXCLUDED."alias",
          "source" = EXCLUDED."source",
          "confidence" = EXCLUDED."confidence"
      `);
    }

    for (const allergen of new Set(entry.allergens ?? [])) {
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "ApkeIngredientAllergen" (
          "id", "ingredientId", "allergen", "relationship", "confidence", "source"
        ) VALUES (${cuidLike("allergen")}, ${ingredientId}, ${allergen}, 'CONTAINS', 1, ${source})
        ON CONFLICT ("ingredientId", "allergen", "relationship") DO UPDATE SET
          "confidence" = EXCLUDED."confidence",
          "source" = EXCLUDED."source"
      `);
    }

    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "ApkeIngredientDictionaryAudit" (
        "id", "ingredientId", "action", "beforeData", "afterData", "source"
      ) VALUES (
        ${cuidLike("audit")}, ${ingredientId}, ${existing.length ? "UPDATED" : "CREATED"},
        ${existing.length ? JSON.stringify(existing[0]) : null}::jsonb,
        ${JSON.stringify(entry)}::jsonb,
        ${source}
      )
    `);

    return ingredientId;
  });
}

export async function ingredientDictionaryStats() {
  const rows = await prisma.$queryRaw<Array<{
    ingredients: bigint;
    aliases: bigint;
    additives: bigint;
    allergenMappings: bigint;
  }>>(Prisma.sql`
    SELECT
      (SELECT COUNT(*) FROM "ApkeIngredient") AS ingredients,
      (SELECT COUNT(*) FROM "ApkeIngredientAlias") AS aliases,
      (SELECT COUNT(*) FROM "ApkeIngredient" WHERE "isAdditive" = true) AS additives,
      (SELECT COUNT(*) FROM "ApkeIngredientAllergen") AS "allergenMappings"
  `).catch(() => []);
  const row = rows[0];
  return {
    ingredients: Number(row?.ingredients ?? 0),
    aliases: Number(row?.aliases ?? 0),
    additives: Number(row?.additives ?? 0),
    allergenMappings: Number(row?.allergenMappings ?? 0),
  };
}
