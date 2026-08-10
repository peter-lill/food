import { normaliseProductText, parseProductName } from "@/lib/products/product-normalisation";

export type RecipeIngredientInput = {
  name: string;
  quantity: number | null;
  unit: string | null;
  productId?: string | null;
};

export type RecipeProductIdentity = {
  id: string;
  name: string;
  canonicalName: string | null;
  aliases: string[];
  inventory: Array<{ quantity: number; unit: string }>;
};

export type RecipeProductIndex = {
  byId: Map<string, RecipeProductIdentity>;
  byIdentityKey: Map<string, RecipeProductIdentity>;
  productOrder: Map<string, number>;
};

export type RecipeProductLookup = RecipeProductIdentity[] | RecipeProductIndex;

export type RecipeProductQueryCandidates = {
  productIds: string[];
  normalisedAliases: string[];
  slugs: string[];
};

export type IngredientAvailability = RecipeIngredientInput & {
  productId: string | null;
  status: "in-pantry" | "partial" | "missing";
  shoppingQuantity?: number | null;
};

const unitFactors: Record<string, { dimension: string; factor: number }> = {
  g: { dimension: "mass", factor: 1 },
  gram: { dimension: "mass", factor: 1 },
  grams: { dimension: "mass", factor: 1 },
  kg: { dimension: "mass", factor: 1000 },
  ml: { dimension: "volume", factor: 1 },
  millilitre: { dimension: "volume", factor: 1 },
  millilitres: { dimension: "volume", factor: 1 },
  l: { dimension: "volume", factor: 1000 },
  litre: { dimension: "volume", factor: 1000 },
  litres: { dimension: "volume", factor: 1000 },
  each: { dimension: "count", factor: 1 },
  item: { dimension: "count", factor: 1 },
  items: { dimension: "count", factor: 1 },
};

export function recipeIngredientIdentityKeys(value: string) {
  const parsed = parseProductName(value);
  return new Set([
    normaliseProductText(value),
    normaliseProductText(parsed.canonicalName),
    parsed.canonicalKey,
  ].filter(Boolean));
}

export function recipeProductQueryCandidates(
  ingredients: RecipeIngredientInput[],
): RecipeProductQueryCandidates {
  const productIds = new Set<string>();
  const normalisedAliases = new Set<string>();
  const slugs = new Set<string>();

  for (const ingredient of ingredients) {
    if (ingredient.productId) productIds.add(ingredient.productId);

    const parsed = parseProductName(ingredient.name);
    for (const key of recipeIngredientIdentityKeys(ingredient.name)) {
      normalisedAliases.add(key);
    }
    if (parsed.canonicalKey) slugs.add(parsed.canonicalKey);
  }

  return {
    productIds: [...productIds],
    normalisedAliases: [...normalisedAliases],
    slugs: [...slugs],
  };
}

function productKeys(product: RecipeProductIdentity) {
  return new Set(
    [product.name, product.canonicalName, ...product.aliases]
      .filter((value): value is string => Boolean(value))
      .flatMap((value) => [...recipeIngredientIdentityKeys(value)]),
  );
}

export function createRecipeProductIndex(
  products: RecipeProductIdentity[],
): RecipeProductIndex {
  const byId = new Map<string, RecipeProductIdentity>();
  const byIdentityKey = new Map<string, RecipeProductIdentity>();
  const productOrder = new Map<string, number>();

  products.forEach((product, index) => {
    if (!byId.has(product.id)) byId.set(product.id, product);
    if (!productOrder.has(product.id)) productOrder.set(product.id, index);

    for (const key of productKeys(product)) {
      if (!byIdentityKey.has(key)) byIdentityKey.set(key, product);
    }
  });

  return { byId, byIdentityKey, productOrder };
}

function asRecipeProductIndex(products: RecipeProductLookup) {
  return Array.isArray(products) ? createRecipeProductIndex(products) : products;
}

function cleanRecipeIngredientSource(line: string) {
  return line
    .trim()
    .replace(/^to serve\s*:\s*/i, "")
    .replace(/^(\d+(?:\.\d+)?\s*(?:kg|g|mg|ml|l))\s*\(\s*[\d\s./¼½¾⅓⅔⅛⅜⅝⅞-]+\s*(?:fl\s*)?oz\s+/i, "$1 ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/^about\s+/i, "")
    .replace(/^(\d+)\s*x\s*[\d.]+\s*cm(?:\s*\/\s*[\d.]+\s*in)?\s*(pieces?)\s+/i, "$1 $2 ")
    .replace(/^(\d+)\s*x\s*[\d.]+\s*cm(?:\s*\/\s*[\d.]+\s*in)?\s+/i, "$1 ")
    .replace(/^\d+(?:\.\d+)?\s*[-–]\s*\d+(?:\.\d+)?\s*cm\s+(pieces?)\s+/i, "1 $1 ")
    .replace(/^\d+(?:\.\d+)?\s*(kg|g|mg|ml|l)\s*[-–]\s*(\d+(?:\.\d+)?)\s*\1\b/i, "$2$1")
    .replace(/^\d+(?:\.\d+)?\s*[-–]\s*(\d+(?:\.\d+)?)\s*(kg|g|mg|ml|l)\b/i, "$1$2")
    .replace(/^(\d+(?:\.\d+)?\s*(?:kg|g|mg|ml|l))\s*\/\s*(?:[\d\s./¼½¾⅓⅔⅛⅜⅝⅞-]+\s*lb\s*)?[\d\s./¼½¾⅓⅔⅛⅜⅝⅞-]*\s*(?:fl\s*)?oz\s+/i, "$1 ")
    .replace(/^(\d+(?:\.\d+)?\s*(?:kg|g|mg|ml|l))\s*\/\s*[\d\s./¼½¾⅓⅔⅛⅜⅝⅞-]+\s*lb\s+/i, "$1 ")
    .replace(/^(\d+(?:\.\d+)?\s*(?:kg|g|mg|ml|l|tablespoons?|tbsp|teaspoons?|tsp))\s+plus\s+(?:\d+(?:\.\d+)?|one|two|three|four|five)(?:\s*[-–]\s*\d+(?:\.\d+)?)?\s*(?:kg|g|mg|ml|l|tablespoons?|tbsp|teaspoons?|tsp)\s+/i, "$1 ")
    .replace(/\bhomemade\s+or\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseRecipeIngredientLine(line: string): RecipeIngredientInput {
  const source = line.trim();
  if (
    /^to serve\s*:?\s*$/i.test(source) ||
    (/^for\b/i.test(source) && !/\d/.test(source)) ||
    (/[:：]\s*$/.test(source) && !/\d/.test(source)) ||
    /^(?:and|or)$/i.test(source) ||
    /^and\s+(?:cut|chopped|sliced|diced|peeled|trimmed)\b/i.test(source)
  ) {
    return { name: "", quantity: null, unit: null };
  }
  const cleanedSource = cleanRecipeIngredientSource(source);
  const alternative = cleanedSource.match(/^(?:\d+(?:\.\d+)?\s*(?:kg|g|mg|ml|l)|\d+(?:\.\d+)?|[¼½¾])\s+or\s+(.+)$/i)?.[1] ?? cleanedSource;
  const main = (alternative
    .replace(/^(?:(?:\d+\s+)?\d+\/\d+|[¼½¾])\s*(?:fl\s*)?(?:oz|lb)\s+/i, "")
    .split(",")[0]?.trim() ?? alternative)
    .replace(/\s+(?:made from|mixed with|tossed with|plus)\b.*$/i, "")
    .replace(/\s+cut into\b.*$/i, "")
    .replace(/\s+or\s+.*$/i, "")
    .replace(/^\s*(?:\d+(?:\.\d+)?\s*)?cloves?\s+of\s+/i, (match) => match.replace(/cloves?\s+of\s+/i, ""))
    .replace(/^\s*(?:\d+(?:\.\d+)?\s*)?(?:fillets?|pieces?|items?)\s+(?:of\s+)?/i, (match) => match.replace(/(?:fillets?|pieces?|items?)\s+(?:of\s+)?/i, ""))
    .trim();
  const parsed = parseProductName(main);
  const container = main.match(/^\s*(?:(\d+(?:\.\d+)?)\s*x\s*)?\d+(?:\.\d+)?\s*(?:kg|g|mg|ml|l)\s+(cans?|tins?|jars?|packets?|packs?|bottles?)\b/i);
  const quantity = container
    ? Number(container[1] ?? 1)
    : parsed.packQuantity ?? parsed.quantity;
  const unit = container
    ? container[2].toLocaleLowerCase("en-AU").replace(/s$/, "")
    : parsed.packUnit ?? parsed.unit ?? (quantity !== null ? "each" : null);
  const name = parsed.searchName || parsed.canonicalName || main;
  return { name: `${name.charAt(0).toLocaleUpperCase("en-AU")}${name.slice(1)}`, quantity, unit };
}

export function resolveRecipeIngredientProduct(
  ingredient: RecipeIngredientInput,
  products: RecipeProductLookup,
) {
  const productIndex = asRecipeProductIndex(products);

  if (ingredient.productId) {
    const canonical = productIndex.byId.get(ingredient.productId);
    if (canonical) return canonical;
  }

  const keys = recipeIngredientIdentityKeys(ingredient.name);
  let matchedProduct: RecipeProductIdentity | null = null;
  let matchedOrder = Number.POSITIVE_INFINITY;
  for (const key of keys) {
    const candidate = productIndex.byIdentityKey.get(key);
    if (!candidate) continue;
    const candidateOrder = productIndex.productOrder.get(candidate.id) ?? Number.POSITIVE_INFINITY;
    if (candidateOrder < matchedOrder) {
      matchedProduct = candidate;
      matchedOrder = candidateOrder;
    }
  }

  return matchedProduct;
}

export function comparableRecipeQuantity(quantity: number, unit: string | null) {
  if (!unit) return null;
  const conversion = unitFactors[normaliseProductText(unit)];
  return conversion ? { dimension: conversion.dimension, value: quantity * conversion.factor } : null;
}

export function getIngredientAvailability(
  ingredient: RecipeIngredientInput,
  products: RecipeProductLookup,
): IngredientAvailability {
  const product = resolveRecipeIngredientProduct(ingredient, products);
  if (!product) return { ...ingredient, productId: null, status: "missing" };

  const positiveInventory = product.inventory.filter((item) => item.quantity > 0);
  if (!positiveInventory.length) {
    return { ...ingredient, productId: product.id, status: "missing" };
  }

  if (ingredient.quantity === null) {
    return { ...ingredient, productId: product.id, status: "in-pantry" };
  }

  const required = comparableRecipeQuantity(ingredient.quantity, ingredient.unit);
  if (!required) return { ...ingredient, productId: product.id, status: "in-pantry" };

  const available = positiveInventory
    .map((item) => comparableRecipeQuantity(item.quantity, item.unit))
    .filter((item): item is NonNullable<typeof item> => item?.dimension === required.dimension)
    .reduce((total, item) => total + item.value, 0);

  if (available === 0) return { ...ingredient, productId: product.id, status: "in-pantry" };
  return {
    ...ingredient,
    productId: product.id,
    status: available >= required.value ? "in-pantry" : "partial",
    shoppingQuantity: available >= required.value
      ? null
      : (required.value - available) / (unitFactors[normaliseProductText(ingredient.unit ?? "")]?.factor ?? 1),
  };
}

export function areEquivalentShoppingIngredients(
  existing: { name: string; productId: string | null },
  incoming: { name: string; productId: string | null },
) {
  if (existing.productId && incoming.productId) return existing.productId === incoming.productId;
  const existingKeys = recipeIngredientIdentityKeys(existing.name);
  return [...recipeIngredientIdentityKeys(incoming.name)].some((key) => existingKeys.has(key));
}

function legacyRecipeIngredientIdentity(value: string) {
  return normaliseProductText(parseRecipeIngredientLine(value).name)
    .split(" ")
    .filter((token) => !["low", "reduced", "fat", "free"].includes(token))
    .join(" ");
}

export function legacyRecipeShoppingIngredientMatches(
  existing: { name: string; quantity: number | null; unit: string | null },
  incoming: { name: string; quantity: number | null; unit: string | null },
) {
  const existingIdentity = legacyRecipeIngredientIdentity(existing.name);
  const incomingIdentity = legacyRecipeIngredientIdentity(incoming.name);
  if (!existingIdentity || existingIdentity !== incomingIdentity) return false;

  const malformedName = /\b(?:and|or|with|of)$/i.test(existing.name) ||
    /\b(?:made from|mixed with)\b/i.test(existing.name);
  const incompatibleAttachedMeasure = normaliseProductText(existing.unit ?? "") === "each" &&
    ["g", "kg", "mg", "ml", "l"].includes(normaliseProductText(incoming.unit ?? "")) &&
    existing.quantity === incoming.quantity;
  const malformedFatVariant = /^(?:low soft cheese|fat greek style natural yoghurt)/i.test(existing.name);
  return malformedName || incompatibleAttachedMeasure || malformedFatVariant;
}

export function mergeShoppingQuantity(
  existing: { quantity: number | null; unit: string | null },
  incoming: { quantity: number | null; unit: string | null },
) {
  if (incoming.quantity === null) return existing;
  if (existing.quantity === null) return incoming;
  if (normaliseProductText(existing.unit ?? "") !== normaliseProductText(incoming.unit ?? "")) return existing;
  return { quantity: existing.quantity + incoming.quantity, unit: existing.unit ?? incoming.unit };
}
