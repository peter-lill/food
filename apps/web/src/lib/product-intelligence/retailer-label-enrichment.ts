import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseAustralianNip } from "@/lib/product-intelligence/australian-nip-parser";

const browserHeaders = {
  "Accept-Language": "en-AU,en;q=0.9",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36",
};

export type RetailerLabel = {
  retailer: string;
  sourceUrl: string;
  retrievedAt: Date;
  servingSize: string | null;
  servingQuantity: number | null;
  servingUnit: string | null;
  servingsPerPackage: number | null;
  calories: number | null;
  proteinGrams: number | null;
  carbsGrams: number | null;
  fatGrams: number | null;
  saturatedFatGrams: number | null;
  fibreGrams: number | null;
  sugarGrams: number | null;
  sodiumMg: number | null;
  energyKjPerServing: number | null;
  proteinGramsPerServing: number | null;
  carbsGramsPerServing: number | null;
  fatGramsPerServing: number | null;
  saturatedFatGramsPerServing: number | null;
  fibreGramsPerServing: number | null;
  sugarGramsPerServing: number | null;
  sodiumMgPerServing: number | null;
  ingredientsText: string | null;
  allergens: string[];
  mayContainAllergens: string[];
  confidence: number;
};

function parseLabel(source: string, retailer: string, sourceUrl: string): RetailerLabel | null {
  const parsed = parseAustralianNip(source);
  if (!parsed) return null;
  const n = parsed.nutrients;
  return {
    retailer,
    sourceUrl,
    retrievedAt: new Date(),
    servingSize: parsed.servingSize,
    servingQuantity: parsed.servingQuantity,
    servingUnit: parsed.servingUnit,
    servingsPerPackage: parsed.servingsPerPackage,
    calories: n.energy.per100 === null ? null : n.energy.per100 / 4.184,
    proteinGrams: n.protein.per100,
    carbsGrams: n.carbohydrate.per100,
    fatGrams: n.fat.per100,
    saturatedFatGrams: n.saturatedFat.per100,
    fibreGrams: n.fibre.per100,
    sugarGrams: n.sugars.per100,
    sodiumMg: n.sodium.per100,
    energyKjPerServing: n.energy.perServing,
    proteinGramsPerServing: n.protein.perServing,
    carbsGramsPerServing: n.carbohydrate.perServing,
    fatGramsPerServing: n.fat.perServing,
    saturatedFatGramsPerServing: n.saturatedFat.perServing,
    fibreGramsPerServing: n.fibre.perServing,
    sugarGramsPerServing: n.sugars.perServing,
    sodiumMgPerServing: n.sodium.perServing,
    ingredientsText: parsed.ingredientsText,
    allergens: parsed.contains,
    mayContainAllergens: parsed.mayContain,
    confidence: parsed.confidence,
  };
}

async function fetchLabel(url: string, retailer: string) {
  if (!/^(Coles|Woolworths)$/i.test(retailer)) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(url, {
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
      headers: { ...browserHeaders, Accept: "text/html,application/xhtml+xml,application/json;q=0.9" },
    });
    if (!response.ok) return null;
    return parseLabel(await response.text(), retailer, url);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function completeness(label: RetailerLabel) {
  return [
    label.servingSize,
    label.servingsPerPackage,
    label.calories,
    label.proteinGrams,
    label.carbsGrams,
    label.fatGrams,
    label.saturatedFatGrams,
    label.sugarGrams,
    label.sodiumMg,
    label.ingredientsText,
    label.allergens.length ? label.allergens : null,
    label.mayContainAllergens.length ? label.mayContainAllergens : null,
  ].filter((value) => value !== null && value !== undefined).length + label.confidence;
}

function mergeLabels(labels: RetailerLabel[]) {
  const ranked = [...labels].sort((left, right) => completeness(right) - completeness(left));
  const pick = <K extends keyof RetailerLabel>(key: K) => ranked.find((label) => {
    const value = label[key];
    return Array.isArray(value) ? value.length > 0 : value !== null && value !== undefined && value !== "";
  })?.[key] ?? null;
  return {
    servingSize: pick("servingSize") as string | null,
    servingQuantity: pick("servingQuantity") as number | null,
    servingUnit: pick("servingUnit") as string | null,
    servingsPerPackage: pick("servingsPerPackage") as number | null,
    calories: pick("calories") as number | null,
    proteinGrams: pick("proteinGrams") as number | null,
    carbsGrams: pick("carbsGrams") as number | null,
    fatGrams: pick("fatGrams") as number | null,
    saturatedFatGrams: pick("saturatedFatGrams") as number | null,
    fibreGrams: pick("fibreGrams") as number | null,
    sugarGrams: pick("sugarGrams") as number | null,
    sodiumMg: pick("sodiumMg") as number | null,
    energyKjPerServing: pick("energyKjPerServing") as number | null,
    proteinGramsPerServing: pick("proteinGramsPerServing") as number | null,
    carbsGramsPerServing: pick("carbsGramsPerServing") as number | null,
    fatGramsPerServing: pick("fatGramsPerServing") as number | null,
    saturatedFatGramsPerServing: pick("saturatedFatGramsPerServing") as number | null,
    fibreGramsPerServing: pick("fibreGramsPerServing") as number | null,
    sugarGramsPerServing: pick("sugarGramsPerServing") as number | null,
    sodiumMgPerServing: pick("sodiumMgPerServing") as number | null,
    ingredientsText: pick("ingredientsText") as string | null,
    allergens: (pick("allergens") as string[] | null) ?? [],
    mayContainAllergens: (pick("mayContainAllergens") as string[] | null) ?? [],
    source: [...new Set(ranked.map((label) => label.retailer))].join(" + "),
    sourceUrl: ranked[0]?.sourceUrl ?? null,
    retrievedAt: ranked[0]?.retrievedAt ?? new Date(),
    confidence: ranked[0]?.confidence ?? 0,
  };
}

export async function enrichProductFromRetailerLabels(productId: string) {
  const listings = await prisma.storeProduct.findMany({
    where: {
      productId,
      active: true,
      productUrl: { not: null },
      retailer: { in: ["Coles", "Woolworths"] },
    },
    orderBy: [{ lastSeenAt: "desc" }],
    select: { retailer: true, productUrl: true },
  });

  const labels = (await Promise.all(listings.map(async (listing) => {
    if (!listing.productUrl) return null;
    return fetchLabel(listing.productUrl, listing.retailer);
  }))).filter((label): label is RetailerLabel => label !== null);
  if (!labels.length) return { status: "not-found" as const };

  const merged = mergeLabels(labels);
  await prisma.$transaction([
    prisma.product.update({
      where: { id: productId },
      data: {
        servingSize: merged.servingSize ?? undefined,
        servingQuantity: merged.servingQuantity ?? undefined,
        servingUnit: merged.servingUnit ?? undefined,
        servingsPerPackage: merged.servingsPerPackage ?? undefined,
        calories: merged.calories ?? undefined,
        proteinGrams: merged.proteinGrams ?? undefined,
        carbsGrams: merged.carbsGrams ?? undefined,
        fatGrams: merged.fatGrams ?? undefined,
        saturatedFatGrams: merged.saturatedFatGrams ?? undefined,
        fibreGrams: merged.fibreGrams ?? undefined,
        sugarGrams: merged.sugarGrams ?? undefined,
        sodiumMg: merged.sodiumMg ?? undefined,
        allergens: merged.allergens.length ? merged.allergens : undefined,
      },
    }),
    prisma.$executeRaw(Prisma.sql`
      UPDATE "Product"
      SET
        "ingredientsText" = COALESCE(${merged.ingredientsText}, "ingredientsText"),
        "mayContainAllergens" = CASE
          WHEN cardinality(${merged.mayContainAllergens}::text[]) > 0 THEN ${merged.mayContainAllergens}::text[]
          ELSE "mayContainAllergens"
        END
      WHERE "id" = ${productId}
    `),
    prisma.$executeRaw(Prisma.sql`
      INSERT INTO "ProductNutritionPanel" (
        "productId", "servingsPerPackage", "servingSize", "servingQuantity", "servingUnit",
        "energyKjPerServing", "proteinGramsPerServing", "fatGramsPerServing", "saturatedFatGramsPerServing",
        "carbsGramsPerServing", "sugarGramsPerServing", "fibreGramsPerServing", "sodiumMgPerServing",
        "energyKjPer100", "proteinGramsPer100", "fatGramsPer100", "saturatedFatGramsPer100",
        "carbsGramsPer100", "sugarGramsPer100", "fibreGramsPer100", "sodiumMgPer100",
        "ingredientsText", "containsAllergens", "mayContainAllergens", "source", "sourceUrl", "verifiedAt", "updatedAt"
      ) VALUES (
        ${productId}, ${merged.servingsPerPackage}, ${merged.servingSize}, ${merged.servingQuantity}, ${merged.servingUnit},
        ${merged.energyKjPerServing}, ${merged.proteinGramsPerServing}, ${merged.fatGramsPerServing}, ${merged.saturatedFatGramsPerServing},
        ${merged.carbsGramsPerServing}, ${merged.sugarGramsPerServing}, ${merged.fibreGramsPerServing}, ${merged.sodiumMgPerServing},
        ${merged.calories === null ? null : merged.calories * 4.184}, ${merged.proteinGrams}, ${merged.fatGrams}, ${merged.saturatedFatGrams},
        ${merged.carbsGrams}, ${merged.sugarGrams}, ${merged.fibreGrams}, ${merged.sodiumMg},
        ${merged.ingredientsText}, ${merged.allergens}::text[], ${merged.mayContainAllergens}::text[],
        ${merged.source}, ${merged.sourceUrl}, ${merged.retrievedAt}, NOW()
      )
      ON CONFLICT ("productId") DO UPDATE SET
        "servingsPerPackage" = COALESCE(EXCLUDED."servingsPerPackage", "ProductNutritionPanel"."servingsPerPackage"),
        "servingSize" = COALESCE(EXCLUDED."servingSize", "ProductNutritionPanel"."servingSize"),
        "servingQuantity" = COALESCE(EXCLUDED."servingQuantity", "ProductNutritionPanel"."servingQuantity"),
        "servingUnit" = COALESCE(EXCLUDED."servingUnit", "ProductNutritionPanel"."servingUnit"),
        "energyKjPerServing" = COALESCE(EXCLUDED."energyKjPerServing", "ProductNutritionPanel"."energyKjPerServing"),
        "proteinGramsPerServing" = COALESCE(EXCLUDED."proteinGramsPerServing", "ProductNutritionPanel"."proteinGramsPerServing"),
        "fatGramsPerServing" = COALESCE(EXCLUDED."fatGramsPerServing", "ProductNutritionPanel"."fatGramsPerServing"),
        "saturatedFatGramsPerServing" = COALESCE(EXCLUDED."saturatedFatGramsPerServing", "ProductNutritionPanel"."saturatedFatGramsPerServing"),
        "carbsGramsPerServing" = COALESCE(EXCLUDED."carbsGramsPerServing", "ProductNutritionPanel"."carbsGramsPerServing"),
        "sugarGramsPerServing" = COALESCE(EXCLUDED."sugarGramsPerServing", "ProductNutritionPanel"."sugarGramsPerServing"),
        "fibreGramsPerServing" = COALESCE(EXCLUDED."fibreGramsPerServing", "ProductNutritionPanel"."fibreGramsPerServing"),
        "sodiumMgPerServing" = COALESCE(EXCLUDED."sodiumMgPerServing", "ProductNutritionPanel"."sodiumMgPerServing"),
        "energyKjPer100" = COALESCE(EXCLUDED."energyKjPer100", "ProductNutritionPanel"."energyKjPer100"),
        "proteinGramsPer100" = COALESCE(EXCLUDED."proteinGramsPer100", "ProductNutritionPanel"."proteinGramsPer100"),
        "fatGramsPer100" = COALESCE(EXCLUDED."fatGramsPer100", "ProductNutritionPanel"."fatGramsPer100"),
        "saturatedFatGramsPer100" = COALESCE(EXCLUDED."saturatedFatGramsPer100", "ProductNutritionPanel"."saturatedFatGramsPer100"),
        "carbsGramsPer100" = COALESCE(EXCLUDED."carbsGramsPer100", "ProductNutritionPanel"."carbsGramsPer100"),
        "sugarGramsPer100" = COALESCE(EXCLUDED."sugarGramsPer100", "ProductNutritionPanel"."sugarGramsPer100"),
        "fibreGramsPer100" = COALESCE(EXCLUDED."fibreGramsPer100", "ProductNutritionPanel"."fibreGramsPer100"),
        "sodiumMgPer100" = COALESCE(EXCLUDED."sodiumMgPer100", "ProductNutritionPanel"."sodiumMgPer100"),
        "ingredientsText" = COALESCE(EXCLUDED."ingredientsText", "ProductNutritionPanel"."ingredientsText"),
        "containsAllergens" = CASE WHEN cardinality(EXCLUDED."containsAllergens") > 0 THEN EXCLUDED."containsAllergens" ELSE "ProductNutritionPanel"."containsAllergens" END,
        "mayContainAllergens" = CASE WHEN cardinality(EXCLUDED."mayContainAllergens") > 0 THEN EXCLUDED."mayContainAllergens" ELSE "ProductNutritionPanel"."mayContainAllergens" END,
        "source" = EXCLUDED."source", "sourceUrl" = EXCLUDED."sourceUrl", "verifiedAt" = EXCLUDED."verifiedAt", "updatedAt" = NOW()
    `),
  ]);

  return {
    status: "completed" as const,
    retailers: [...new Set(labels.map((label) => label.retailer))],
    source: merged.source,
    retrievedAt: merged.retrievedAt,
    confidence: merged.confidence,
  };
}

export async function getProductLabelText(productId: string) {
  const rows = await prisma.$queryRaw<Array<{ ingredientsText: string | null; mayContainAllergens: string[] }>>(Prisma.sql`
    SELECT COALESCE(n."ingredientsText", p."ingredientsText") AS "ingredientsText",
           CASE WHEN cardinality(n."mayContainAllergens") > 0 THEN n."mayContainAllergens" ELSE p."mayContainAllergens" END AS "mayContainAllergens"
    FROM "Product" p
    LEFT JOIN "ProductNutritionPanel" n ON n."productId" = p."id"
    WHERE p."id" = ${productId}
    LIMIT 1
  `);
  return rows[0] ?? { ingredientsText: null, mayContainAllergens: [] };
}
