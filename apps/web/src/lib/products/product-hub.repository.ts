import { prisma } from "@/lib/prisma";
import { identifyGrocery } from "@/lib/grocery-intelligence/identity";

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
  productType: string;
  category: string | null;
  description: string | null;
  imageUrl: string | null;
  packSize: string | null;
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
  variants: Array<{
    id: string;
    name: string;
    slug: string | null;
    brand: string | null;
    barcode: string | null;
    packSize: string | null;
    imageUrl: string | null;
    latestPrice: number | null;
    latestRetailer: string | null;
  }>;
};

function bestProductImage(
  productImageUrl: string | null,
  storeProducts: Array<{ imageUrl: string | null }>,
) {
  return productImageUrl ?? storeProducts.find((listing) => listing.imageUrl)?.imageUrl ?? null;
}

function genericFamilyImage(familyName: string) {
  if (familyName === "Button Mushroom") return "/product-images/button-mushroom.svg";
  return null;
}

function titleCase(value: string) {
  return value
    .toLocaleLowerCase("en-AU")
    .replace(/(^|[\s/(-])([a-z])/g, (_match, prefix: string, letter: string) => `${prefix}${letter.toLocaleUpperCase("en-AU")}`);
}

function canonicalProduceFamily(value: string) {
  const normalised = value
    .toLocaleLowerCase("en-AU")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (/\bmushrooms?\b/.test(normalised)) return "Button Mushroom";

  return null;
}

function productFamilyName(value: string) {
  const identity = identifyGrocery(value);
  if (identity) return identity.family ?? identity.canonicalName;

  const cleaned = value
    .replace(/^\s*(?:qty\s*)?\d+\s*[x×]\s*/i, "")
    .replace(/^\s*[x×]\s*/i, "")
    .replace(/^\s*\d+(?:\.\d+)?\s*(?:g|kg|ml|l)\b\s*/i, "")
    .replace(/^\s*\d+\s*[x×]\s*\d+(?:\.\d+)?\s*(?:g|kg|ml|l)\b\s*/i, "")
    .replace(/\b\d+(?:\.\d+)?\s*(?:g|kg|gram|grams|ml|l)\b/gi, "")
    .replace(/\bcoles\b/gi, "")
    .replace(/\bslcd\b/gi, "sliced")
    .replace(/\s+/g, " ")
    .trim();

  const produceFamily = canonicalProduceFamily(cleaned);
  if (produceFamily) return produceFamily;

  return cleaned ? titleCase(cleaned) : titleCase(value.trim());
}

function identityText(product: { name: string; canonicalName: string | null }) {
  return product.canonicalName?.trim() || product.name;
}

function normaliseFamily(value: string) {
  return value.toLocaleLowerCase("en-AU").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function genericFamilyNames(products: Array<{ name: string; canonicalName: string | null; brand: string | null; barcode: string | null }>) {
  return products
    .filter((product) => !product.brand && !product.barcode)
    .map((product) => productFamilyName(identityText(product)))
    .filter(Boolean)
    .sort((left, right) => right.length - left.length);
}

function resolvedFamilyName(
  product: { name: string; canonicalName: string | null; brand: string | null; barcode: string | null },
  genericFamilies: string[],
) {
  const ownFamily = productFamilyName(identityText(product));
  if (!product.brand && !product.barcode) return ownFamily;
  const normalisedOwnFamily = normaliseFamily(ownFamily);
  return genericFamilies.find((family) => {
    const normalisedGeneric = normaliseFamily(family);
    return normalisedOwnFamily === normalisedGeneric || normalisedOwnFamily.endsWith(` ${normalisedGeneric}`);
  }) ?? ownFamily;
}

export async function getProductHubList(query?: string): Promise<ProductHubListItem[]> {
  const search = query?.trim();
  const products = await prisma.product.findMany({
    where: {
      lifecycle: { not: "ARCHIVED" },
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" as const } },
              { canonicalName: { contains: search, mode: "insensitive" as const } },
              { brand: { contains: search, mode: "insensitive" as const } },
              { barcode: { contains: search } },
              { aliases: { some: { alias: { contains: search, mode: "insensitive" as const } } } },
            ],
          }
        : {}),
    },
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

  const grouped = new Map<string, ProductHubListItem>();
  const genericFamilies = genericFamilyNames(products);

  for (const product of products) {
    const recipeIds = new Set(
      product.ingredientRecords.flatMap((ingredient) =>
        ingredient.recipes.map((recipe) => recipe.recipeId),
      ),
    );
    const retailers = new Set(product.storeProducts.map((listing) => listing.retailer));
    const latest = product.priceObservations[0] ?? null;
    const familyName = resolvedFamilyName(product, genericFamilies);
    const familyKey = familyName.toLocaleLowerCase("en-AU");
    const current = grouped.get(familyKey);
    const familyImage = genericFamilyImage(familyName);

    if (!current) {
      grouped.set(familyKey, {
        id: product.id,
        name: product.name,
        canonicalName: familyName,
        slug: product.slug,
        brand: product.brand,
        category: product.category,
        imageUrl: familyImage ?? bestProductImage(product.imageUrl, product.storeProducts),
        barcode: product.barcode,
        aliasCount: product.aliases.length,
        recipeCount: recipeIds.size,
        pantryQuantity: product.inventoryItems.reduce((total, item) => total + item.quantity, 0),
        retailerCount: retailers.size,
        latestPrice: latest?.price ?? null,
        latestRetailer: latest?.retailer ?? null,
        latestObservedAt: latest?.observedAt ?? null,
      });
      continue;
    }

    current.aliasCount += product.aliases.length + 1;
    current.recipeCount += recipeIds.size;
    current.pantryQuantity += product.inventoryItems.reduce((total, item) => total + item.quantity, 0);
    current.retailerCount += retailers.size;
    current.imageUrl = familyImage ?? current.imageUrl ?? bestProductImage(product.imageUrl, product.storeProducts);
    current.category ??= product.category;
    current.brand = null;
    current.barcode = null;

    if (latest && (!current.latestObservedAt || latest.observedAt > current.latestObservedAt)) {
      current.latestPrice = latest.price;
      current.latestRetailer = latest.retailer;
      current.latestObservedAt = latest.observedAt;
    }
  }

  return [...grouped.values()].sort((left, right) =>
    (left.canonicalName ?? left.name).localeCompare(right.canonicalName ?? right.name, "en-AU"),
  );
}

export async function getProductHubDetail(idOrSlug: string): Promise<ProductHubDetail | null> {
  const product = await prisma.product.findFirst({
    where: {
      lifecycle: { not: "ARCHIVED" },
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

  const familyCandidates = await prisma.product.findMany({
    where: { lifecycle: { not: "ARCHIVED" } },
    include: {
      storeProducts: { select: { imageUrl: true } },
      priceObservations: {
        orderBy: { observedAt: "desc" },
        take: 1,
        select: { price: true, retailer: true },
      },
    },
    orderBy: [{ brand: "asc" }, { name: "asc" }],
    take: 1000,
  });
  const genericFamilies = genericFamilyNames(familyCandidates);
  const familyName = resolvedFamilyName(product, genericFamilies);
  const variants = familyCandidates
    .filter((candidate) => candidate.id !== product.id)
    .filter((candidate) => resolvedFamilyName(candidate, genericFamilies) === familyName)
    .filter((candidate) => Boolean(candidate.brand || candidate.barcode || candidate.storeProducts.length))
    .map((candidate) => ({
      id: candidate.id,
      name: candidate.name,
      slug: candidate.slug,
      brand: candidate.brand,
      barcode: candidate.barcode,
      packSize: candidate.packSize,
      imageUrl: bestProductImage(candidate.imageUrl, candidate.storeProducts),
      latestPrice: candidate.priceObservations[0]?.price ?? null,
      latestRetailer: candidate.priceObservations[0]?.retailer ?? null,
    }));

  return {
    id: product.id,
    name: product.name,
    canonicalName: familyName,
    slug: product.slug,
    brand: product.brand,
    barcode: product.barcode,
    productType: product.productType,
    category: product.category,
    description: product.description,
    imageUrl: genericFamilyImage(familyName) ?? bestProductImage(product.imageUrl, product.storeProducts),
    packSize: product.packSize,
    servingSize: product.servingSize,
    servingQuantity: product.servingQuantity,
    servingUnit: product.servingUnit,
    servingsPerPackage: product.servingsPerPackage,
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
    variants,
  };
}
