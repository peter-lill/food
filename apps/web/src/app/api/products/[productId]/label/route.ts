import { NextResponse } from "next/server";
import { getProductLabelText } from "@/lib/product-intelligence/retailer-label-enrichment";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ productId: string }> };

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
      storeProducts: {
        where: { active: true, retailer: { in: ["Coles", "Woolworths"] } },
        select: { retailer: true },
      },
    },
  });

  if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });

  const labelText = await getProductLabelText(product.id);
  const isFreshProduce = product.productType === "GENERIC_PRODUCE";
  const produceIngredient = product.canonicalName?.trim() || product.name.trim();

  return NextResponse.json({
    productType: product.productType,
    servingSize: product.servingSize,
    servingQuantity: product.servingQuantity,
    servingUnit: product.servingUnit,
    servingsPerPackage: product.servingsPerPackage,
    nutrition: {
      calories: product.calories,
      proteinGrams: product.proteinGrams,
      carbsGrams: product.carbsGrams,
      fatGrams: product.fatGrams,
      saturatedFatGrams: product.saturatedFatGrams,
      fibreGrams: product.fibreGrams,
      sugarGrams: product.sugarGrams,
      sodiumMg: product.sodiumMg,
    },
    ingredientsText: labelText.ingredientsText ?? (isFreshProduce ? produceIngredient : null),
    contains: product.allergens,
    mayContain: labelText.mayContainAllergens,
    retailers: [...new Set(product.storeProducts.map((listing) => listing.retailer))],
  });
}
