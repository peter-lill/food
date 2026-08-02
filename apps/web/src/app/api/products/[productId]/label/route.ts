import { NextResponse } from "next/server";
import { getProductLabelText } from "@/lib/product-intelligence/retailer-label-enrichment";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ productId: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const { productId } = await params;
  const decodedProductId = decodeURIComponent(productId);
  const [product, labelText] = await Promise.all([
    prisma.product.findUnique({
      where: { id: decodedProductId },
      select: {
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
    }),
    getProductLabelText(decodedProductId),
  ]);

  if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });

  return NextResponse.json({
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
    ingredientsText: labelText.ingredientsText,
    contains: product.allergens,
    mayContain: labelText.mayContainAllergens,
    retailers: [...new Set(product.storeProducts.map((listing) => listing.retailer))],
  });
}
