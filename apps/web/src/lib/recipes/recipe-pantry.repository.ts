import { prisma } from "@/lib/prisma";
import type { PlannerRecipe } from "@/lib/planner/planner.types";
import bhfCatalogue from "@/generated/bhf-recipes.json";
import { hwqSnackRecipes } from "./hwq-snacks";
import {
  getIngredientAvailability,
  parseRecipeIngredientLine,
  type IngredientAvailability,
  type RecipeIngredientInput,
  type RecipeProductIdentity,
} from "./recipe-pantry";

export type RecipeAvailabilityMap = Record<string, IngredientAvailability[]>;

export async function getRecipeProductCatalogue(): Promise<RecipeProductIdentity[]> {
  const products = await prisma.product.findMany({
    select: {
      id: true,
      name: true,
      canonicalName: true,
      aliases: { select: { alias: true } },
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
  const products = await getRecipeProductCatalogue();
  const entries: Array<[string, RecipeIngredientInput[]]> = [
    ...recipes.map((recipe) => [recipe.id, plannerIngredients(recipe)] as [string, RecipeIngredientInput[]]),
    ...hwqSnackRecipes.map((recipe) => [recipe.id, recipe.ingredients.map(parseRecipeIngredientLine)] as [string, RecipeIngredientInput[]]),
    ...bhfCatalogue.recipes.map((recipe) => [recipe.id, recipe.ingredients.map(parseRecipeIngredientLine)] as [string, RecipeIngredientInput[]]),
  ];

  return Object.fromEntries(entries.map(([id, ingredients]) => [
    id,
    ingredients.map((ingredient) => getIngredientAvailability(ingredient, products)),
  ]));
}
