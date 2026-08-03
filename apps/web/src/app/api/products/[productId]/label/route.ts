import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { enrichProductKnowledge } from "@/lib/product-intelligence/barcode-enrichment";
import {
  enrichProductFromRetailerLabels,
  getProductLabelText,
} from "@/lib/product-intelligence/retailer-label-enrichment";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ productId: string }> };

type CanonicalNip = {
  servingsPerPackage: number | null;
  servingSize: string | null;
  servingQuantity: number | null;
  servingUnit: string | null;
  energyKjPer100: number | null;
  proteinGramsPer100: number | null;
  carbsGramsPer100: number | null;
  fatGramsPer100: number | null;
  saturatedFatGramsPer100: number | null;
  fibreGramsPer100: number | null;
  sugarGramsPer100: number | null;
  sodiumMgPer100: number | null;
  ingredientsText: string | null;
  containsAllergens: string[];
  mayContainAllergens: string[];
  source: string | null;
  sourceUrl: string | null;
  verifiedAt: Date | null;
};

const productSelect = {
  id: true,
  name: true,
  canonicalName: true,
  barcode: true,
  productType: true,
  servingSize: true,
  servingQuantity: true,
  servingUnit: true,
  servingsPerPackage: true,
  calories: true,
  proteinGrams: true,
  carbsGrams: true,
  fatGrams: true,
  saturatedFatGrams: true,
  fibreGrams: true,
  sugarGrams: true,
  sodiumMg: true,
  allergens: true,
  updatedAt: true,
  storeProducts: {
    where: { active: true, retailer: { in: ["Coles", "Woolworths"] as string[] } },
    select: { retailer: true },
  },
} as const;

async function canonicalNip(productId: string) {
  const rows = await prisma.$queryRaw<CanonicalNip[]>(Prisma.sql`
    SELECT
      "servingsPerPackage", "servingSize", "servingQuantity", "servingUnit",
      "energyKjPer100", "proteinGramsPer100", "carbsGramsPer100", "fatGramsPer100",
      "saturatedFatGramsPer100", "fibreGramsPer100", "sugarGramsPer100", "sodiumMgPer100",
      "ingredientsText", "containsAllergens", "mayContainAllergens", "source", "sourceUrl", "verifiedAt"
    FROM "ProductNutritionPanel"
    WHERE "productId" = ${productId}
    LIMIT 1
  `).catch(() => [] as CanonicalNip[]);
  return rows[0] ?? null;
}

function labelIncomplete(
  canonical: CanonicalNip | null,
  product: { servingSize: string | null; servingQuantity: number | null; servingsPerPackage: number | null },
) {
  const servingRecorded = Boolean(canonical?.servingSize || canonical?.servingQuantity || product.servingSize || product.servingQuantity);
  const servingsRecorded = (canonical?.servingsPerPackage ?? product.servingsPerPackage) !== null;
  return !servingRecorded || !servingsRecorded || !canonical?.ingredientsText;
}

function cleanIngredientText(value: unknown) {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned.length >= 3 ? cleaned : null;
}

async function fetchBarcodeIngredients(barcode: string | null) {
  if (!barcode) return null;
  const digits = barcode.replace(/\D/g, "");
  if (!/^\d{8,14}$/.test(digits)) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const fields = "ingredients_text,ingredients_text_en,allergens_tags,traces_tags";
    const response = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(digits)}.json?fields=${fields}`,
      {
        cache: "no-store",
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          "User-Agent": "Food/0.1 (https://food.coffeehq.coffee)",
        },
      },
    );
    if (!response.ok) return null;
    const payload = await response.json() as {
      status?: number;
      product?: {
        ingredients_text?: unknown;
        ingredients_text_en?: unknown;
        allergens_tags?: unknown;
        traces_tags?: unknown;
      };
    };
    if (payload.status === 0 || !payload.product) return null;

    const normaliseTags = (value: unknown) => Array.isArray(value)
      ? value
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.replace(/^[a-z]{2}:/i, "").replace(/[-_]+/g, " ").trim())
        .filter(Boolean)
      : [];

    const ingredientsText = cleanIngredientText(payload.product.ingredients_text)
      ?? cleanIngredientText(payload.product.ingredients_text_en);
    if (!ingredientsText) return null;

    return {
      ingredientsText,
      contains: normaliseTags(payload.product.allergens_tags),
      mayContain: normaliseTags(payload.product.traces_tags),
      sourceUrl: `https://world.openfoodfacts.org/product/${digits}`,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function saveBarcodeIngredients(productId: string, barcode: string | null) {
  const result = await fetchBarcodeIngredients(barcode);
  if (!result) return false;

  await prisma.$transaction([
    prisma.$executeRaw(Prisma.sql`
      UPDATE "Product"
      SET
        "ingredientsText" = COALESCE("ingredientsText", ${result.ingredientsText}),
        "mayContainAllergens" = CASE
          WHEN cardinality("mayContainAllergens") = 0 AND cardinality(${result.mayContain}::text[]) > 0
            THEN ${result.mayContain}::text[]
          ELSE "mayContainAllergens"
        END,
        "allergens" = CASE
          WHEN cardinality("allergens") = 0 AND cardinality(${result.contains}::text[]) > 0
            THEN ${result.contains}::text[]
          ELSE "allergens"
        END,
        "updatedAt" = NOW()
      WHERE "id" = ${productId}
    `),
    prisma.$executeRaw(Prisma.sql`
      UPDATE "ProductNutritionPanel"
      SET
        "ingredientsText" = COALESCE("ingredientsText", ${result.ingredientsText}),
        "containsAllergens" = CASE
          WHEN cardinality("containsAllergens") = 0 AND cardinality(${result.contains}::text[]) > 0
            THEN ${result.contains}::text[]
          ELSE "containsAllergens"
        END,
        "mayContainAllergens" = CASE
          WHEN cardinality("mayContainAllergens") = 0 AND cardinality(${result.mayContain}::text[]) > 0
            THEN ${result.mayContain}::text[]
          ELSE "mayContainAllergens"
        END,
        "source" = CASE
          WHEN "source" IS NULL OR "source" = '' THEN 'Open Food Facts'
          WHEN "source" NOT ILIKE '%Open Food Facts%' THEN "source" || ' + Open Food Facts'
          ELSE "source"
        END,
        "sourceUrl" = COALESCE("sourceUrl", ${result.sourceUrl}),
        "verifiedAt" = NOW(),
        "updatedAt" = NOW()
      WHERE "productId" = ${productId}
    `),
  ]);
  return true;
}

export async function GET(_request: Request, { params }: RouteContext) {
  const { productId } = await params;
  const decodedProductId = decodeURIComponent(productId);

  let product = await prisma.product.findFirst({
    where: {
      lifecycle: { not: "ARCHIVED" },
      OR: [{ id: decodedProductId }, { slug: decodedProductId }],
    },
    select: productSelect,
  });

  if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });

  let canonical = await canonicalNip(product.id);

  if (labelIncomplete(canonical, product) && product.storeProducts.length) {
    await enrichProductFromRetailerLabels(product.id).catch(() => null);
    canonical = await canonicalNip(product.id);
    product = await prisma.product.findUniqueOrThrow({ where: { id: product.id }, select: productSelect });
  }

  if (labelIncomplete(canonical, product)) {
    await prisma.productEnrichmentJob.deleteMany({
      where: {
        productId: product.id,
        provider: "barcode-knowledge-v1",
        status: "COMPLETED",
      },
    });
    await enrichProductKnowledge(product.id).catch(() => null);
    canonical = await canonicalNip(product.id);
    product = await prisma.product.findUniqueOrThrow({ where: { id: product.id }, select: productSelect });
  }

  if (!canonical?.ingredientsText && product.barcode) {
    await saveBarcodeIngredients(product.id, product.barcode).catch(() => false);
    canonical = await canonicalNip(product.id);
    product = await prisma.product.findUniqueOrThrow({ where: { id: product.id }, select: productSelect });
  }

  const labelText = canonical ? null : await getProductLabelText(product.id);
  const isFreshProduce = product.productType === "GENERIC_PRODUCE";
  const produceIngredient = product.canonicalName?.trim() || product.name.trim();

  return NextResponse.json({
    productType: product.productType,
    servingSize: canonical?.servingSize ?? product.servingSize,
    servingQuantity: canonical?.servingQuantity ?? product.servingQuantity,
    servingUnit: canonical?.servingUnit ?? product.servingUnit,
    servingsPerPackage: canonical?.servingsPerPackage ?? product.servingsPerPackage,
    nutrition: {
      calories: canonical?.energyKjPer100 == null ? product.calories : canonical.energyKjPer100 / 4.184,
      proteinGrams: canonical?.proteinGramsPer100 ?? product.proteinGrams,
      carbsGrams: canonical?.carbsGramsPer100 ?? product.carbsGrams,
      fatGrams: canonical?.fatGramsPer100 ?? product.fatGrams,
      saturatedFatGrams: canonical?.saturatedFatGramsPer100 ?? product.saturatedFatGrams,
      fibreGrams: canonical?.fibreGramsPer100 ?? product.fibreGrams,
      sugarGrams: canonical?.sugarGramsPer100 ?? product.sugarGrams,
      sodiumMg: canonical?.sodiumMgPer100 ?? product.sodiumMg,
    },
    ingredientsText: canonical?.ingredientsText ?? labelText?.ingredientsText ?? (isFreshProduce ? produceIngredient : null),
    contains: canonical?.containsAllergens?.length ? canonical.containsAllergens : product.allergens,
    mayContain: canonical?.mayContainAllergens ?? labelText?.mayContainAllergens ?? [],
    retailers: [...new Set(product.storeProducts.map((listing) => listing.retailer))],
    source: canonical?.source ?? null,
    sourceUrl: canonical?.sourceUrl ?? null,
    verifiedAt: canonical?.verifiedAt ?? product.updatedAt,
  });
}
