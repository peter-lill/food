import { prisma } from "@/lib/prisma";

export type ProductHubListItem = {
  id: string;
  name: string;
  canonicalName: string | null;
  slug: string | null;
  brand: string | null;
  category: string | null;
  imageUrl: string | null;
  barcode: string | null;
  aliasCount: number;
  recipeCount: number;
  pantryQuantity: number;
  retailerCount: number;
  latestPrice: number | null;
  latestRetailer: string | null;
  latestObservedAt: Date | null;
};

export type ProductHubDetail = {
  id: string;
  name: string;
  canonicalName: string | null;
  slug: string | null;
  brand: string | null;
  barcode: string | null;
  category: string | null;
  description: string | null;
  imageUrl: string | null;
  packSize: string | null;
  calories: number | null;
  proteinGrams: number | null;
  carbsGrams: number | null;
  fatGrams: number | null;
  saturatedFatGrams: number | null;
  fibreGrams: number | null;
  sugarGrams: number | null;
  sodiumMg: number | null;
  allergens: string[];
  dietaryTags: string[];
  aliases: Array<{ id: string; alias: string; source: string | null }>;
  inventory: Array<{
    id: string;
    location: string;
    quantity: number;
    unit: string;
    expiresAt: Date | null;
  }>;
  recipes: Array<{ id: string; name: string; sourceName: string | null }>;
  storeProducts: Array<{
    id: string;
    retailer: string;
    retailerProductName: string;
    brand: string | null;
    packSize: string | null;
    productUrl: string | null;
    imageUrl: string | null;
    aisle: string | null;
    lastSeenAt: Date | null;
  }>;
  priceObservations: Array<{
    id: string;
    retailer: string;
    price: number;
    unitPrice: number | null;
    unitLabel: string | null;
    isSpecial: boolean;
    source: string;
    sourceUrl: string | null;
    observedAt: Date;
  }>;
};

function bestProductImage(
  productImageUrl: string | null,
  storeProducts: Array<{ imageUrl: string | null }>,
) {
  return productImageUrl ?? storeProducts.find((listing) => listing.imageUrl)?.imageUrl ?? null;
}

export async function getProductHubList(query?: string): Promise<ProductHubListItem[]> {
  const search = query?.trim();
  const products = await prisma.product.findMany({
    where: search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { canonicalName: { contains: search, mode: "insensitive" } },
            { brand: { contains: search, mode: "insensitive" } },
            { barcode: { contains: search } },
            { aliases: { some: { alias: { contains: search, mode: "insensitive" } } } },
          ],
        }
      : undefined,
    include: {
      aliases: { select: { id: true } },
      inventoryItems: { select: { quantity: true } },
      ingredientRecords: {
        select: {
          recipes: {
            select: { recipeId: true },
          },
        },
      },
      storeProducts: { select: { retailer: true, imageUrl: true } },
      priceObservations: {
        orderBy: { observedAt: "desc" },
        take: 1,
        select: { price: true, retailer: true, observedAt: true },
      },
    },
    orderBy: [{ canonicalName: "asc" }, { name: "asc" }],
    take: 500,
  });

  return products.map((product) => {
    const recipeIds = new Set(
      product.ingredientRecords.flatMap((ingredient) =>
        ingredient.recipes.map((recipe) => recipe.recipeId),
      ),
    );
    const retailers = new Set(product.storeProducts.map((listing) => listing.retailer));
    const latest = product.priceObservations[0] ?? null;

    return {
      id: product.id,
      name: product.name,
      canonicalName: product.canonicalName,
      slug: product.slug,
      brand: product.brand,
      category: product.category,
      imageUrl: bestProductImage(product.imageUrl, product.storeProducts),
      barcode: product.barcode,
      aliasCount: product.aliases.length,
      recipeCount: recipeIds.size,
      pantryQuantity: product.inventoryItems.reduce((total, item) => total + item.quantity, 0),
      retailerCount: retailers.size,
      latestPrice: latest?.price ?? null,
      latestRetailer: latest?.retailer ?? null,
      latestObservedAt: latest?.observedAt ?? null,
    };
  });
}

export async function getProductHubDetail(idOrSlug: string): Promise<ProductHubDetail | null> {
  const product = await prisma.product.findFirst({
    where: {
      OR: [{ id: idOrSlug }, { slug: idOrSlug }],
    },
    include: {
      aliases: { orderBy: { alias: "asc" } },
      inventoryItems: { orderBy: [{ location: "asc" }, { expiresAt: "asc" }] },
      ingredientRecords: {
        include: {
          recipes: {
            include: {
              recipe: { select: { id: true, name: true, sourceName: true } },
            },
          },
        },
      },
      storeProducts: { orderBy: [{ retailer: "asc" }, { retailerProductName: "asc" }] },
      priceObservations: {
        orderBy: { observedAt: "desc" },
        take: 100,
      },
    },
  });

  if (!product) return null;

  const recipeMap = new Map<string, { id: string; name: string; sourceName: string | null }>();
  for (const ingredient of product.ingredientRecords) {
    for (const link of ingredient.recipes) {
      recipeMap.set(link.recipe.id, link.recipe);
    }
  }

  return {
    id: product.id,
    name: product.name,
    canonicalName: product.canonicalName,
    slug: product.slug,
    brand: product.brand,
    barcode: product.barcode,
    category: product.category,
    description: product.description,
    imageUrl: bestProductImage(product.imageUrl, product.storeProducts),
    packSize: product.packSize,
    calories: product.calories,
    proteinGrams: product.proteinGrams,
    carbsGrams: product.carbsGrams,
    fatGrams: product.fatGrams,
    saturatedFatGrams: product.saturatedFatGrams,
    fibreGrams: product.fibreGrams,
    sugarGrams: product.sugarGrams,
    sodiumMg: product.sodiumMg,
    allergens: product.allergens,
    dietaryTags: product.dietaryTags,
    aliases: product.aliases.map(({ id, alias, source }) => ({ id, alias, source })),
    inventory: product.inventoryItems.map(({ id, location, quantity, unit, expiresAt }) => ({
      id,
      location,
      quantity,
      unit,
      expiresAt,
    })),
    recipes: [...recipeMap.values()].sort((left, right) => left.name.localeCompare(right.name)),
    storeProducts: product.storeProducts.map((listing) => ({
      id: listing.id,
      retailer: listing.retailer,
      retailerProductName: listing.retailerProductName,
      brand: listing.brand,
      packSize: listing.packSize,
      productUrl: listing.productUrl,
      imageUrl: listing.imageUrl,
      aisle: listing.aisle,
      lastSeenAt: listing.lastSeenAt,
    })),
    priceObservations: product.priceObservations.map((observation) => ({
      id: observation.id,
      retailer: observation.retailer,
      price: observation.price,
      unitPrice: observation.unitPrice,
      unitLabel: observation.unitLabel,
      isSpecial: observation.isSpecial,
      source: observation.source,
      sourceUrl: observation.sourceUrl,
      observedAt: observation.observedAt,
    })),
  };
}
