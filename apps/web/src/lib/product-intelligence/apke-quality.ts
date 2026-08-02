import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type ApkeQuality = {
  productId: string;
  identityScore: number;
  nutritionScore: number;
  labelScore: number;
  retailScore: number;
  imageScore: number;
  overallScore: number;
  missingFields: string[];
  issues: string[];
};

type QualityRow = {
  id: string;
  name: string;
  canonicalName: string | null;
  brand: string | null;
  barcode: string | null;
  packSize: string | null;
  imageUrl: string | null;
  lifecycle: string;
  servingsPerPackage: number | null;
  servingSize: string | null;
  servingQuantity: number | null;
  calories: number | null;
  proteinGrams: number | null;
  carbsGrams: number | null;
  fatGrams: number | null;
  saturatedFatGrams: number | null;
  sugarGrams: number | null;
  sodiumMg: number | null;
  allergens: string[];
  ingredientsText: string | null;
  mayContainAllergens: string[];
  retailerCount: bigint;
  activeRetailerUrlCount: bigint;
  gtinStatus: string | null;
};

function percentage(values: boolean[]) {
  if (!values.length) return 0;
  return Math.round((values.filter(Boolean).length / values.length) * 100);
}

export async function calculateProductQuality(productId: string): Promise<ApkeQuality | null> {
  const rows = await prisma.$queryRaw<QualityRow[]>(Prisma.sql`
    SELECT
      p."id", p."name", p."canonicalName", p."brand", p."barcode", p."packSize", p."imageUrl", p."lifecycle"::text,
      COALESCE(n."servingsPerPackage", p."servingsPerPackage") AS "servingsPerPackage",
      COALESCE(n."servingSize", p."servingSize") AS "servingSize",
      COALESCE(n."servingQuantity", p."servingQuantity") AS "servingQuantity",
      COALESCE(n."energyKjPer100" / 4.184, p."calories") AS "calories",
      COALESCE(n."proteinGramsPer100", p."proteinGrams") AS "proteinGrams",
      COALESCE(n."carbsGramsPer100", p."carbsGrams") AS "carbsGrams",
      COALESCE(n."fatGramsPer100", p."fatGrams") AS "fatGrams",
      COALESCE(n."saturatedFatGramsPer100", p."saturatedFatGrams") AS "saturatedFatGrams",
      COALESCE(n."sugarGramsPer100", p."sugarGrams") AS "sugarGrams",
      COALESCE(n."sodiumMgPer100", p."sodiumMg") AS "sodiumMg",
      CASE WHEN cardinality(COALESCE(n."containsAllergens", ARRAY[]::text[])) > 0 THEN n."containsAllergens" ELSE p."allergens" END AS "allergens",
      n."ingredientsText", COALESCE(n."mayContainAllergens", ARRAY[]::text[]) AS "mayContainAllergens",
      (SELECT COUNT(DISTINCT sp."retailer") FROM "StoreProduct" sp WHERE sp."productId" = p."id" AND sp."active") AS "retailerCount",
      (SELECT COUNT(*) FROM "StoreProduct" sp WHERE sp."productId" = p."id" AND sp."active" AND sp."productUrl" IS NOT NULL) AS "activeRetailerUrlCount",
      g."status"::text AS "gtinStatus"
    FROM "Product" p
    LEFT JOIN "ProductNutritionPanel" n ON n."productId" = p."id"
    LEFT JOIN "ProductGtinIdentity" g ON g."productId" = p."id"
    WHERE p."id" = ${productId}
    LIMIT 1
  `);
  const row = rows[0];
  if (!row) return null;

  const missingFields: string[] = [];
  const issues: string[] = [];
  const require = (value: unknown, field: string) => {
    const present = Array.isArray(value) ? value.length > 0 : value !== null && value !== undefined && value !== "";
    if (!present) missingFields.push(field);
    return present;
  };

  const identityScore = percentage([
    require(row.barcode, "gtin"),
    require(row.canonicalName ?? row.name, "canonicalName"),
    require(row.brand, "brand"),
    require(row.packSize, "packSize"),
    row.gtinStatus === "VERIFIED" || row.gtinStatus === "PROVISIONAL",
  ]);
  if (row.gtinStatus === "CONFLICT") issues.push("GTIN_IDENTITY_CONFLICT");
  if (row.lifecycle === "REVIEW_REQUIRED") issues.push("PRODUCT_REVIEW_REQUIRED");

  const nutritionScore = percentage([
    require(row.servingsPerPackage, "servingsPerPackage"),
    require(row.servingSize ?? row.servingQuantity, "servingSize"),
    require(row.calories, "energyPer100"),
    require(row.proteinGrams, "proteinPer100"),
    require(row.fatGrams, "fatPer100"),
    require(row.saturatedFatGrams, "saturatedFatPer100"),
    require(row.carbsGrams, "carbohydratePer100"),
    require(row.sugarGrams, "sugarsPer100"),
    require(row.sodiumMg, "sodiumPer100"),
  ]);

  const labelScore = percentage([
    require(row.ingredientsText, "ingredients"),
    require(row.allergens, "containsAllergens"),
  ]);
  const retailScore = percentage([
    Number(row.retailerCount) > 0,
    Number(row.activeRetailerUrlCount) > 0,
  ]);
  if (Number(row.retailerCount) === 0) missingFields.push("retailerListing");
  if (Number(row.activeRetailerUrlCount) === 0) missingFields.push("retailerProductUrl");
  const imageScore = require(row.imageUrl, "image") ? 100 : 0;

  const overallScore = Math.round(
    identityScore * 0.3 + nutritionScore * 0.3 + labelScore * 0.2 + retailScore * 0.1 + imageScore * 0.1,
  );

  return {
    productId: row.id,
    identityScore,
    nutritionScore,
    labelScore,
    retailScore,
    imageScore,
    overallScore,
    missingFields: [...new Set(missingFields)],
    issues: [...new Set(issues)],
  };
}

export async function saveProductQuality(productId: string) {
  const quality = await calculateProductQuality(productId);
  if (!quality) return null;

  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "ProductQualitySnapshot" (
      "id", "productId", "identityScore", "nutritionScore", "labelScore", "retailScore", "imageScore",
      "overallScore", "missingFields", "issues", "calculatedAt"
    ) VALUES (
      ${randomUUID()}, ${quality.productId}, ${quality.identityScore}, ${quality.nutritionScore}, ${quality.labelScore},
      ${quality.retailScore}, ${quality.imageScore}, ${quality.overallScore}, ${quality.missingFields}::text[], ${quality.issues}::text[], CURRENT_TIMESTAMP
    )
    ON CONFLICT ("productId") DO UPDATE SET
      "identityScore" = EXCLUDED."identityScore", "nutritionScore" = EXCLUDED."nutritionScore",
      "labelScore" = EXCLUDED."labelScore", "retailScore" = EXCLUDED."retailScore",
      "imageScore" = EXCLUDED."imageScore", "overallScore" = EXCLUDED."overallScore",
      "missingFields" = EXCLUDED."missingFields", "issues" = EXCLUDED."issues", "calculatedAt" = CURRENT_TIMESTAMP
  `);

  const repairReasons = [
    ...quality.issues,
    ...quality.missingFields.map((field) => `MISSING_${field.replace(/([a-z])([A-Z])/g, "$1_$2").toUpperCase()}`),
  ];
  for (const reason of repairReasons) {
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "ProductRepairItem" ("id", "productId", "reason", "status", "priority")
      VALUES (${randomUUID()}, ${productId}, ${reason}, ${quality.issues.includes(reason) ? 10 : 100 - Math.min(80, quality.overallScore)},
        ${quality.issues.includes(reason) ? "REVIEW_REQUIRED" : "QUEUED"}::"ProductRepairStatus")
      ON CONFLICT DO NOTHING
    `).catch(async () => {
      await prisma.$executeRaw(Prisma.sql`
        INSERT INTO "ProductRepairItem" ("id", "productId", "reason", "status", "priority")
        VALUES (${randomUUID()}, ${productId}, ${reason}, ${quality.issues.includes(reason) ? "REVIEW_REQUIRED" : "QUEUED"}::"ProductRepairStatus", ${quality.issues.includes(reason) ? 10 : 100 - Math.min(80, quality.overallScore)})
        ON CONFLICT DO NOTHING
      `);
    });
  }
  return quality;
}

export async function getCatalogueHealth() {
  const rows = await prisma.$queryRaw<Array<{
    products: bigint;
    scored: bigint;
    complete: bigint;
    needsReview: bigint;
    missingNip: bigint;
    missingIngredients: bigint;
    missingServingSize: bigint;
    missingImages: bigint;
    identityConflicts: bigint;
    averageScore: number | null;
  }>>(Prisma.sql`
    SELECT
      (SELECT COUNT(*) FROM "Product" WHERE "lifecycle" <> 'ARCHIVED') AS products,
      COUNT(*) AS scored,
      COUNT(*) FILTER (WHERE q."overallScore" >= 95 AND cardinality(q."issues") = 0) AS complete,
      COUNT(*) FILTER (WHERE cardinality(q."issues") > 0) AS "needsReview",
      COUNT(*) FILTER (WHERE 'energyPer100' = ANY(q."missingFields")) AS "missingNip",
      COUNT(*) FILTER (WHERE 'ingredients' = ANY(q."missingFields")) AS "missingIngredients",
      COUNT(*) FILTER (WHERE 'servingSize' = ANY(q."missingFields")) AS "missingServingSize",
      COUNT(*) FILTER (WHERE 'image' = ANY(q."missingFields")) AS "missingImages",
      COUNT(*) FILTER (WHERE 'GTIN_IDENTITY_CONFLICT' = ANY(q."issues")) AS "identityConflicts",
      AVG(q."overallScore")::float AS "averageScore"
    FROM "ProductQualitySnapshot" q
  `);
  const row = rows[0];
  return {
    products: Number(row?.products ?? 0),
    scored: Number(row?.scored ?? 0),
    complete: Number(row?.complete ?? 0),
    needsReview: Number(row?.needsReview ?? 0),
    missingNip: Number(row?.missingNip ?? 0),
    missingIngredients: Number(row?.missingIngredients ?? 0),
    missingServingSize: Number(row?.missingServingSize ?? 0),
    missingImages: Number(row?.missingImages ?? 0),
    identityConflicts: Number(row?.identityConflicts ?? 0),
    averageScore: Math.round((row?.averageScore ?? 0) * 10) / 10,
  };
}
