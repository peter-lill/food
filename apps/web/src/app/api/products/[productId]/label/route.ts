import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getProductLabelText } from "@/lib/product-intelligence/retailer-label-enrichment";
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

export async function GET(_request: Request, { params }: RouteContext) {
  const { productId } = await params;
  const decodedProductId = decodeURIComponent(productId);
  const product = await prisma.product.findFirst({
    where: {
      lifecycle: { not: "ARCHIVED" },
      OR: [{ id: decodedProductId }, { slug: decodedProductId }],
    },
    select: {
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
        where: { active: true, retailer: { in: ["Coles", "Woolworths"] } },
        select: { retailer: true },
      },
    },
  });

  if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });

  const canonicalRows = await prisma.$queryRaw<CanonicalNip[]>(Prisma.sql`
    SELECT
      "servingsPerPackage", "servingSize", "servingQuantity", "servingUnit",
      "energyKjPer100", "proteinGramsPer100", "carbsGramsPer100", "fatGramsPer100",
      "saturatedFatGramsPer100", "fibreGramsPer100", "sugarGramsPer100", "sodiumMgPer100",
      "ingredientsText", "containsAllergens", "mayContainAllergens", "source", "sourceUrl", "verifiedAt"
    FROM "ProductNutritionPanel"
    WHERE "productId" = ${product.id}
    LIMIT 1
  `).catch(() => [] as CanonicalNip[]);

  const canonical = canonicalRows[0] ?? null;
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
