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

export function parseRecipeIngredientLine(line: string): RecipeIngredientInput {
  const main = line.split(",")[0]?.trim() ?? line.trim();
  const parsed = parseProductName(main);
  const quantity = parsed.quantity ?? parsed.packQuantity;
  const unit = parsed.unit ?? parsed.packUnit ?? (quantity !== null ? "each" : null);
  return { name: parsed.canonicalName || main, quantity, unit };
}

export function resolveRecipeIngredientProduct(
  ingredient: RecipeIngredientInput,
  products: RecipeProductIdentity[],
) {
  if (ingredient.productId) {
    const canonical = products.find((product) => product.id === ingredient.productId);
    if (canonical) return canonical;
  }

  const keys = recipeIngredientIdentityKeys(ingredient.name);
  return products.find((product) => {
    const candidates = productKeys(product);
    return [...keys].some((key) => candidates.has(key));
  }) ?? null;
}

export function comparableRecipeQuantity(quantity: number, unit: string | null) {
  if (!unit) return null;
  const conversion = unitFactors[normaliseProductText(unit)];
  return conversion ? { dimension: conversion.dimension, value: quantity * conversion.factor } : null;
}

export function getIngredientAvailability(
  ingredient: RecipeIngredientInput,
  products: RecipeProductIdentity[],
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

export function mergeShoppingQuantity(
  existing: { quantity: number | null; unit: string | null },
  incoming: { quantity: number | null; unit: string | null },
) {
  if (incoming.quantity === null) return existing;
  if (existing.quantity === null) return incoming;
  if (normaliseProductText(existing.unit ?? "") !== normaliseProductText(incoming.unit ?? "")) return existing;
  return { quantity: existing.quantity + incoming.quantity, unit: existing.unit ?? incoming.unit };
}
