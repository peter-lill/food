import { prisma } from "@/lib/prisma";
import type { PlannerRecipe } from "@/lib/planner/planner.types";
import bhfCatalogue from "@/generated/bhf-recipes.json";
import { hwqSnackRecipes } from "./hwq-snacks";
import {
  createRecipeProductIndex,
  getIngredientAvailability,
  parseRecipeIngredientLine,
  recipeProductQueryCandidates,
  type IngredientAvailability,
  type RecipeIngredientInput,
  type RecipeProductIdentity,
} from "./recipe-pantry";

export type RecipeAvailabilityMap = Record<string, IngredientAvailability[]>;

export async function getRecipeProductCatalogue(
  ingredients: RecipeIngredientInput[],
): Promise<RecipeProductIdentity[]> {
  const candidates = recipeProductQueryCandidates(ingredients);
  if (
    candidates.productIds.length === 0 &&
    candidates.normalisedAliases.length === 0 &&
    candidates.slugs.length === 0
  ) return [];

  const [slugMatches, aliasMatches, stockedItems] = await Promise.all([
    candidates.slugs.length > 0
      ? prisma.product.findMany({
        where: { slug: { in: candidates.slugs } },
        select: { id: true },
      })
      : Promise.resolve([]),
    candidates.normalisedAliases.length > 0
      ? prisma.productAlias.findMany({
        where: { normalised: { in: candidates.normalisedAliases } },
        select: { productId: true },
      })
      : Promise.resolve([]),
    prisma.inventoryItem.findMany({
      where: { quantity: { gt: 0 } },
      select: {
        quantity: true,
        unit: true,
        product: {
          select: {
            id: true,
            name: true,
            canonicalName: true,
            aliases: { select: { alias: true } },
          },
        },
      },
    }),
  ]);

  const matchedProductIds = new Set([
    ...candidates.productIds,
    ...slugMatches.map((product) => product.id),
    ...aliasMatches.map((alias) => alias.productId),
  ]);
  const matchedProducts = matchedProductIds.size > 0
    ? await prisma.product.findMany({
      where: { id: { in: [...matchedProductIds] } },
      select: {
        id: true,
        name: true,
        canonicalName: true,
        aliases: { select: { alias: true } },
      },
    })
    : [];

  const products = new Map<string, RecipeProductIdentity>();
  for (const product of matchedProducts) {
    products.set(product.id, {
      id: product.id,
      name: product.name,
      canonicalName: product.canonicalName,
      aliases: product.aliases.map((alias) => alias.alias),
      inventory: [],
    });
  }
  for (const item of stockedItems) {
    const product = products.get(item.product.id) ?? {
      id: item.product.id,
      name: item.product.name,
      canonicalName: item.product.canonicalName,
      aliases: item.product.aliases.map((alias) => alias.alias),
      inventory: [],
    };
    product.inventory.push({ quantity: item.quantity, unit: item.unit });
    products.set(product.id, product);
  }

  return [...products.values()];
}

function plannerIngredients(recipe: PlannerRecipe): RecipeIngredientInput[] {
  return recipe.ingredients.map((ingredient) => ({
    name: ingredient.name,
    quantity: ingredient.quantity,
    unit: ingredient.unit,
    productId: ingredient.productId,
  }));
}

export async function getRecipeAvailability(recipes: PlannerRecipe[]): Promise<RecipeAvailabilityMap> {
  const entries: Array<[string, RecipeIngredientInput[]]> = [
    ...recipes.map((recipe) => [recipe.id, plannerIngredients(recipe)] as [string, RecipeIngredientInput[]]),
    ...hwqSnackRecipes.map((recipe) => [recipe.id, recipe.ingredients.map(parseRecipeIngredientLine).filter((ingredient) => ingredient.name.length > 0)] as [string, RecipeIngredientInput[]]),
    ...bhfCatalogue.recipes.map((recipe) => [recipe.id, recipe.ingredients.map(parseRecipeIngredientLine).filter((ingredient) => ingredient.name.length > 0)] as [string, RecipeIngredientInput[]]),
  ];
  const products = await getRecipeProductCatalogue(entries.flatMap(([, ingredients]) => ingredients));
  const productIndex = createRecipeProductIndex(products);

  return Object.fromEntries(entries.map(([id, ingredients]) => [
    id,
    ingredients.map((ingredient) => getIngredientAvailability(ingredient, productIndex)),
  ]));
}
