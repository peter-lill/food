import { prisma } from "@/lib/prisma";
import { identifyGrocery } from "@/lib/grocery-intelligence/identity";
import { genericImageIdentity } from "@/lib/products/generic-image-policy";
import { heroProductDescription } from "@/lib/products/product-description";
import { productDepartment, supermarketDepartments, type SupermarketDepartment } from "@/lib/products/product-category";
import { externalRecipes } from "@/lib/recipes/external-recipes";
import { withSourceImage } from "@/lib/recipes/recipe-image";

const externalRecipeByName = new Map(externalRecipes.map(withSourceImage).map((recipe) => [recipe.name, recipe]));
const localRecipeImages: Record<string, string> = {
  "Mushroom and Thyme Cob Loaf": "/recipes/mushroom-thyme-cob-loaf.webp",
  "Spinach and Cheese Cob Loaf": "/recipes/spinach-cheese-cob-loaf.webp",
  "Creamy Chicken and Corn Cob Loaf": "/recipes/creamy-chicken-corn-cob-loaf.webp",
  "Roasted Capsicum and Feta Cob Loaf": "/recipes/roasted-capsicum-feta-cob-loaf.webp",
  "Sweet Chilli Prawn Cob Loaf": "/recipes/sweet-chilli-prawn-cob-loaf.webp",
};

export type ProductHubListItem = {
  id: string;
  name: string;
  canonicalName: string | null;
  slug: string | null;
  brand: string | null;
  description: string | null;
  category: string | null;
  shelfLabel: string | null;
  productType: string;
  imageUrl: string | null;
  barcode: string | null;
  aliasCount: number;
  recipeCount: number;
  pantryQuantity: number;
  retailerCount: number;
  variantCount: number;
  latestPrice: number | null;
  latestRetailer: string | null;
  latestPackSize: string | null;
  latestObservedAt: Date | null;
  latestIsSpecial: boolean;
  priceNeedsSpecificVariant: boolean;
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
  recipes: Array<{ id: string; name: string; description: string | null; sourceName: string | null; sourceUrl: string | null; imageUrl: string | null; minutes: number | null }>;
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

/**
 * Older Woolworths imports stored the complete browse path in `aisle`.
 * The catalogue must never render that implementation detail as a heading.
 */
export function displayShelfLabel(aisle: string | null | undefined) {
  const value = aisle?.trim() ?? "";
  if (!value) return null;
  if (!value.includes("/")) return value;

  const segments = value.split("/").map((segment) => segment.trim()).filter(Boolean);
  const browseIndex = segments.findIndex((segment) => segment.toLocaleLowerCase("en-AU") === "browse");
  const terminalSegment = browseIndex >= 0 ? segments.slice(browseIndex + 2).at(-1) : null;
  if (!terminalSegment) return value;
  return terminalSegment
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (character) => character.toLocaleUpperCase("en-AU"));
}

/**
 * Prefer an authoritative legacy Woolworths browse path over a historical
 * name-derived department until the controlled importer has persisted it.
 */
export function departmentFromLegacyWoolworthsPath(aisle: string | null | undefined): SupermarketDepartment | null {
  const segments = (aisle?.trim() ?? "").split("/").map((segment) => segment.trim().toLocaleLowerCase("en-AU")).filter(Boolean);
  const browseIndex = segments.indexOf("browse");
  if (browseIndex < 0) return null;
  const [root, ...descendants] = segments.slice(browseIndex + 1);
  if (root === "fruit-veg") return "Fruit & vegetables";
  if (root === "bakery") return "Bakery";
  if (root === "dairy-eggs-fridge") return "Dairy & eggs";
  if (root === "freezer") return "Frozen";
  if (root === "pantry") return descendants.some((segment) => /(?:confectionery|chocolate|lollies)/.test(segment)) ? "Confectionery" : "Pantry";
  if (root === "drinks" || root === "liquor") return "Drinks";
  if (root === "beauty") return "Health & personal care";
  if (root === "baby") return "Baby";
  if (root === "cleaning-maintenance") return "Household";
  if (root === "pet") return "Pet";
  if (root === "meat-seafood-deli") return descendants.some((segment) => /(?:^|-)deli(?:-|$)/.test(segment)) ? "Deli" : "Meat & seafood";
  return null;
}

export function bestProductImage(
  productImageUrl: string | null,
  storeProducts: Array<{ imageUrl: string | null }>,
  hasStoredAsset = false,
) {
  return productImageUrl
    ?? (hasStoredAsset ? "stored://product-image" : null)
    ?? storeProducts.find((listing) => listing.imageUrl)?.imageUrl
    ?? null;
}

function genericFamilyImage(familyName: string) {
  if (familyName === "Button Mushroom") return "/product-images/button-mushroom.svg";
  return null;
}

export function finaliseProductFamilyListItem(
  item: ProductHubListItem,
  variantCount: number,
  retailerCount: number,
): ProductHubListItem {
  if (variantCount <= 1) return { ...item, variantCount, retailerCount };

  return {
    ...item,
    brand: null,
    barcode: null,
    description: null,
    imageUrl: genericFamilyImage(item.canonicalName ?? item.name),
    retailerCount,
    variantCount,
    priceNeedsSpecificVariant: item.latestPrice !== null,
  };
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
  if (/\brocket\b/.test(normalised)) return "Rocket Leaves";

  return null;
}

function productFamilyName(value: string) {
  const identity = identifyGrocery(value);
  if (identity) return identity.family ?? identity.canonicalName;

  const cleaned = value
    .replace(/^\s*(?:qty\s*)?\d+\s*[xÃ—]\s*/i, "")
    .replace(/^\s*[xÃ—]\s*/i, "")
    .replace(/^\s*\d+(?:\.\d+)?\s*(?:g|kg|ml|l)\b\s*/i, "")
    .replace(/^\s*\d+\s*[xÃ—]\s*\d+(?:\.\d+)?\s*(?:g|kg|ml|l)\b\s*/i, "")
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

function productVarietyName(product: { name: string; canonicalName: string | null }) {
  return identifyGrocery(identityText(product))?.canonicalName ?? productFamilyName(identityText(product));
}

function normaliseFamily(value: string) {
  return value.toLocaleLowerCase("en-AU").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function genericFamilyNames(products: Array<{ name: string; canonicalName: string | null; brand: string | null; barcode: string | null }>) {
  return [...new Set(products
    .filter((product) => !product.brand && !product.barcode)
    .map((product) => productFamilyName(identityText(product)))
    .filter(Boolean)
  )].sort((left, right) => right.length - left.length);
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

export function latestPricesByRetailer(observations: Array<{
  retailer: string;
  price: number;
  isSpecial: boolean;
  observedAt: Date;
  storeProduct: { packSize: string | null } | null;
}>) {
  const latest = new Map<string, {
    retailer: string;
    price: number;
    isSpecial: boolean;
    packSize: string | null;
    observedAt: Date;
  }>();

  for (const observation of observations) {
    if (!latest.has(observation.retailer)) {
      latest.set(observation.retailer, {
        retailer: observation.retailer,
        price: observation.price,
        isSpecial: observation.isSpecial,
        packSize: observation.storeProduct?.packSize ?? null,
        observedAt: observation.observedAt,
      });
    }
  }

  return [...latest.values()].sort((left, right) => {
    const order = ["Coles", "Woolworths"];
    return (order.indexOf(left.retailer) + 1 || 99) - (order.indexOf(right.retailer) + 1 || 99);
  });
}

export type ProductDepartmentCount = {
  department: SupermarketDepartment;
  productCount: number;
};

export async function getProductDepartmentCounts(): Promise<ProductDepartmentCount[]> {
  const categories = await prisma.product.groupBy({
    by: ["category"],
    where: { lifecycle: { not: "ARCHIVED" } },
    _count: { _all: true },
  });
  const counts = new Map<SupermarketDepartment, number>();

  for (const category of categories) {
    const department = productDepartment(category.category, "");
    counts.set(department, (counts.get(department) ?? 0) + category._count._all);
  }

  return supermarketDepartments
    .map((department) => ({ department, productCount: counts.get(department) ?? 0 }))
    .filter(({ productCount }) => productCount > 0);
}

export async function getProductHubList(query?: string, department?: SupermarketDepartment): Promise<ProductHubListItem[]> {
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
      ...(department ? { category: { equals: department, mode: "insensitive" as const } } : {}),
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
      storeProducts: { select: { retailer: true, imageUrl: true, aisle: true } },
      priceObservations: {
        orderBy: { observedAt: "desc" },
        take: 12,
        select: {
          price: true,
          retailer: true,
          observedAt: true,
          isSpecial: true,
          storeProduct: { select: { packSize: true } },
        },
      },
    },
    orderBy: [{ canonicalName: "asc" }, { name: "asc" }],
    take: department ? 2_000 : 500,
  });
  const storedImageProducts = new Set((await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT DISTINCT p."id"
    FROM "Product" p
    LEFT JOIN "ProductImageCandidate" c
      ON c."productId" = p."id"
      AND c."selected" = true
      AND c."rejected" = false
      AND c."assetId" IS NOT NULL
    WHERE p."primaryImageAssetId" IS NOT NULL OR c."id" IS NOT NULL
  `).map((row) => row.id));

  const grouped = new Map<string, ProductHubListItem>();
  const groupedProductIds = new Map<string, Set<string>>();
  const groupedRetailers = new Map<string, Set<string>>();
  const groupedHasGenericImage = new Set<string>();
  const genericFamilies = genericFamilyNames(products);

  for (const product of products) {
    if (/^(?:cm\s+pieces?|each\s+of\b.*|mint\s+leaves\s+and\s+lemon\s+wedges)$/i.test(normaliseFamily(identityText(product)))) continue;
    const recipeIds = new Set(
      product.ingredientRecords.flatMap((ingredient) =>
        ingredient.recipes.map((recipe) => recipe.recipeId),
      ),
    );
    const retailers = new Set(product.storeProducts.map((listing) => listing.retailer));
    const latest = product.priceObservations[0] ?? null;
    const retailerPrices = latestPricesByRetailer(product.priceObservations);
    const bestRetailerPrice = [...retailerPrices].sort((left, right) => left.price - right.price)[0] ?? null;
    const familyName = resolvedFamilyName(product, genericFamilies);
    const familyKey = familyName.toLocaleLowerCase("en-AU");
    const productIds = groupedProductIds.get(familyKey) ?? new Set<string>();
    productIds.add(product.id);
    groupedProductIds.set(familyKey, productIds);
    const familyRetailers = groupedRetailers.get(familyKey) ?? new Set<string>();
    for (const retailer of retailers) familyRetailers.add(retailer);
    groupedRetailers.set(familyKey, familyRetailers);
    const current = grouped.get(familyKey);
    const familyImage = genericFamilyImage(familyName);
    const isGeneric = !product.brand && !product.barcode && product.storeProducts.length === 0;

    if (!current) {
      const woolworthsAisle = product.storeProducts.find((listing) => listing.retailer === "Woolworths")?.aisle;
      const sourceDepartment = departmentFromLegacyWoolworthsPath(woolworthsAisle);
      grouped.set(familyKey, {
        id: product.id,
        name: product.name,
        canonicalName: familyName,
        slug: product.slug,
        brand: product.brand,
        description: heroProductDescription(product.description, product.brand),
        category: product.category ?? sourceDepartment,
        shelfLabel: displayShelfLabel(woolworthsAisle),
        productType: product.productType,
        imageUrl: familyImage ?? bestProductImage(product.imageUrl, product.storeProducts, storedImageProducts.has(product.id)),
        barcode: product.barcode,
        aliasCount: product.aliases.length,
        recipeCount: recipeIds.size,
        pantryQuantity: product.inventoryItems.reduce((total, item) => total + item.quantity, 0),
        retailerCount: familyRetailers.size,
        variantCount: 1,
        latestPrice: bestRetailerPrice?.price ?? null,
        latestRetailer: bestRetailerPrice?.retailer ?? null,
        latestPackSize: bestRetailerPrice ? bestRetailerPrice.packSize ?? "Size not recorded" : null,
        latestObservedAt: latest?.observedAt ?? null,
        latestIsSpecial: bestRetailerPrice?.isSpecial ?? false,
        priceNeedsSpecificVariant: false,
      });
      if (isGeneric && Boolean(familyImage ?? product.imageUrl ?? (storedImageProducts.has(product.id) ? "stored" : null))) {
        groupedHasGenericImage.add(familyKey);
      }
      continue;
    }

    current.aliasCount += product.aliases.length + 1;
    current.recipeCount += recipeIds.size;
    current.pantryQuantity += product.inventoryItems.reduce((total, item) => total + item.quantity, 0);
    current.retailerCount = familyRetailers.size;
    const woolworthsAisle = product.storeProducts.find((listing) => listing.retailer === "Woolworths")?.aisle;
    current.category = product.category ?? departmentFromLegacyWoolworthsPath(woolworthsAisle) ?? current.category;
    current.shelfLabel ??= displayShelfLabel(woolworthsAisle);
    if (isGeneric) {
      current.name = familyName;
      current.category = product.category;
      current.productType = product.productType;
      const genericImage = familyImage
        ?? product.imageUrl
        ?? (storedImageProducts.has(product.id) ? "stored://product-image" : null);
      if (genericImage) {
        current.id = product.id;
        current.slug = product.slug;
        current.imageUrl = genericImage;
        groupedHasGenericImage.add(familyKey);
      } else if (!groupedHasGenericImage.has(familyKey)) {
        current.id = product.id;
        current.slug = product.slug;
        current.imageUrl = null;
      }
    }
    current.description ??= heroProductDescription(product.description, product.brand);
    current.brand = null;
    current.barcode = null;

    if (latest && (!current.latestObservedAt || latest.observedAt > current.latestObservedAt)) {
      current.latestPrice = bestRetailerPrice?.price ?? null;
      current.latestRetailer = bestRetailerPrice?.retailer ?? null;
      current.latestPackSize = bestRetailerPrice ? bestRetailerPrice.packSize ?? "Size not recorded" : null;
      current.latestObservedAt = latest.observedAt;
      current.latestIsSpecial = bestRetailerPrice?.isSpecial ?? false;
    }
  }

  for (const [familyKey, item] of grouped) {
    const variantCount = groupedProductIds.get(familyKey)?.size ?? 1;
    grouped.set(familyKey, finaliseProductFamilyListItem(
      item,
      variantCount,
      groupedRetailers.get(familyKey)?.size ?? 0,
    ));
  }

  return [...grouped.values()].sort((left, right) =>
    (left.canonicalName ?? left.name).localeCompare(right.canonicalName ?? right.name, "en-AU"),
  );
}

export async function getProductHubDetail(idOrSlug: string, options: { specific?: boolean } = {}): Promise<ProductHubDetail | null> {
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
              recipe: { select: { id: true, name: true, description: true, sourceName: true, sourceUrl: true, prepMinutes: true, cookMinutes: true } },
            },
          },
        },
      },
      storeProducts: { where: { active: true }, orderBy: [{ retailer: "asc" }, { retailerProductName: "asc" }] },
      priceObservations: {
        where: { OR: [{ storeProductId: null }, { storeProduct: { active: true } }] },
        orderBy: { observedAt: "desc" },
        take: 100,
      },
    },
  });

  if (!product) return null;

  const recipeMap = new Map<string, ProductHubDetail["recipes"][number]>();
  for (const ingredient of product.ingredientRecords) {
    for (const link of ingredient.recipes) {
      const external = externalRecipeByName.get(link.recipe.name);
      const totalMinutes = (link.recipe.prepMinutes ?? 0) + (link.recipe.cookMinutes ?? 0);
      recipeMap.set(link.recipe.id, {
        id: link.recipe.id,
        name: link.recipe.name,
        description: link.recipe.description,
        sourceName: link.recipe.sourceName,
        sourceUrl: link.recipe.sourceUrl ?? external?.sourceUrl ?? null,
        imageUrl: localRecipeImages[link.recipe.name]
          ?? (external?.sourceName === "Heart Foundation" ? `/api/recipes/local-image/${external.id}` : external?.imageUrl)
          ?? null,
        minutes: totalMinutes || external?.minutes || null,
      });
    }
  }

  const familyCandidates = await prisma.product.findMany({
    where: { lifecycle: { not: "ARCHIVED" } },
    include: {
      storeProducts: { select: { imageUrl: true, brand: true } },
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
  const specificName = productVarietyName(product);
  const variants = familyCandidates
    .filter((candidate) => resolvedFamilyName(candidate, genericFamilies) === familyName)
    .filter((candidate) => {
      const varietyName = productVarietyName(candidate);
      return Boolean(candidate.brand || candidate.barcode || candidate.storeProducts.length)
        || normaliseFamily(varietyName) !== normaliseFamily(familyName);
    })
    .map((candidate) => ({
      id: candidate.id,
      name: productVarietyName(candidate),
      slug: candidate.slug,
      brand: candidate.brand
        ?? candidate.storeProducts.find((listing) => listing.brand)?.brand
        ?? (candidate.barcode ? "Packaged product" : null),
      barcode: candidate.barcode,
      packSize: candidate.packSize,
      imageUrl: bestProductImage(candidate.imageUrl, candidate.storeProducts),
      latestPrice: candidate.priceObservations[0]?.price ?? null,
      latestRetailer: candidate.priceObservations[0]?.retailer ?? null,
    }));

  return {
    id: product.id,
    name: product.name,
    canonicalName: options.specific ? specificName : familyName,
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
    variants: options.specific ? [] : variants,
  };
}

