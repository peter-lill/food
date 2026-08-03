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

function plausibleIngredients(value: string | null | undefined) {
  if (!value) return null;
  const cleaned = value.replace(/^ingredients?\s*:?\s*/i, "").replace(/\s+/g, " ").trim();
  if (cleaned.length < 12 || cleaned.length > 5000) return null;
  if (/\$\s*\d|\bsave\s*\$|\bper\s+100g\b|\benergy\b|\bmax\s+load\b|\bnew\s+[a-z]+\b/i.test(cleaned)) return null;
  const letters = (cleaned.match(/[a-z]/gi) ?? []).length;
  const digits = (cleaned.match(/\d/g) ?? []).length;
  if (letters < 10 || digits > letters * 0.35) return null;
  if (!/[,;()]|\bcontains\b/i.test(cleaned)) return null;
  if (!/\b(sugar|milk|wheat|flour|cocoa|oil|fat|salt|soy|lecithin|emulsifier|flavour|colour|starch|syrup|butter|yeast|acid|gum|powder|solids|extract|water)\b/i.test(cleaned)) return null;
  return cleaned;
}

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
  return !servingRecorded || !servingsRecorded || !plausibleIngredients(canonical?.ingredientsText);
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
  if (canonical?.ingredientsText && !plausibleIngredients(canonical.ingredientsText)) {
    await prisma.$transaction([
      prisma.$executeRaw(Prisma.sql`UPDATE "ProductNutritionPanel" SET "ingredientsText" = NULL, "updatedAt" = NOW() WHERE "productId" = ${product.id}`),
      prisma.$executeRaw(Prisma.sql`UPDATE "Product" SET "ingredientsText" = NULL, "updatedAt" = NOW() WHERE "id" = ${product.id}`),
    ]).catch(() => undefined);
    canonical = await canonicalNip(product.id);
  }

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

  const labelText = canonical ? null : await getProductLabelText(product.id);
  const isFreshProduce = product.productType === "GENERIC_PRODUCE";
  const produceIngredient = product.canonicalName?.trim() || product.name.trim();
  const ingredientsText = plausibleIngredients(canonical?.ingredientsText)
    ?? plausibleIngredients(labelText?.ingredientsText)
    ?? (isFreshProduce ? produceIngredient : null);

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
    ingredientsText,
    contains: canonical?.containsAllergens?.length ? canonical.containsAllergens : product.allergens,
    mayContain: canonical?.mayContainAllergens ?? labelText?.mayContainAllergens ?? [],
    retailers: [...new Set(product.storeProducts.map((listing) => listing.retailer))],
    source: canonical?.source ?? null,
    sourceUrl: canonical?.sourceUrl ?? null,
    verifiedAt: canonical?.verifiedAt ?? product.updatedAt,
  });
}
