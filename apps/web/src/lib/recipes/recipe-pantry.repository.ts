import { prisma } from "@/lib/prisma";
import type { PlannerRecipe } from "@/lib/planner/planner.types";
import bhfCatalogue from "@/generated/bhf-recipes.json";
import { hwqSnackRecipes } from "./hwq-snacks";
import {
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
    candidates.names.length === 0 &&
    candidates.normalisedAliases.length === 0 &&
    candidates.slugs.length === 0
  ) return [];

  const products = await prisma.product.findMany({
    where: {
      OR: [
        ...(candidates.productIds.length > 0
          ? [{ id: { in: candidates.productIds } }]
          : []),
        ...(candidates.slugs.length > 0
          ? [{ slug: { in: candidates.slugs } }]
          : []),
        ...(candidates.names.length > 0
          ? [
            { name: { in: candidates.names, mode: "insensitive" as const } },
            { canonicalName: { in: candidates.names, mode: "insensitive" as const } },
          ]
          : []),
        ...(candidates.normalisedAliases.length > 0
          ? [{ aliases: { some: { normalised: { in: candidates.normalisedAliases } } } }]
          : []),
      ],
    },
    select: {
      id: true,
      name: true,
      canonicalName: true,
      aliases: {
        where: { normalised: { in: candidates.normalisedAliases } },
        select: { alias: true },
      },
      inventoryItems: {
        where: { quantity: { gt: 0 } },
        select: { quantity: true, unit: true },
      },
    },
  });

  return products.map((product) => ({
    id: product.id,
    name: product.name,
    canonicalName: product.canonicalName,
    aliases: product.aliases.map((alias) => alias.alias),
    inventory: product.inventoryItems,
  }));
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
    ...hwqSnackRecipes.map((recipe) => [recipe.id, recipe.ingredients.map(parseRecipeIngredientLine)] as [string, RecipeIngredientInput[]]),
    ...bhfCatalogue.recipes.map((recipe) => [recipe.id, recipe.ingredients.map(parseRecipeIngredientLine)] as [string, RecipeIngredientInput[]]),
  ];
  const products = await getRecipeProductCatalogue(entries.flatMap(([, ingredients]) => ingredients));

  return Object.fromEntries(entries.map(([id, ingredients]) => [
    id,
    ingredients.map((ingredient) => getIngredientAvailability(ingredient, products)),
  ]));
}
