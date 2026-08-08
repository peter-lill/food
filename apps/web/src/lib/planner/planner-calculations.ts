import {
  comparableRecipeQuantity,
  createRecipeProductIndex,
  getIngredientAvailability,
  recipeIngredientIdentityKeys,
  type IngredientAvailability,
  type RecipeIngredientInput,
  type RecipeProductIdentity,
} from "@/lib/recipes/recipe-pantry";
import { normaliseProductText } from "@/lib/products/product-normalisation";
import type {
  PlannerDayAvailability,
  PlannerDaySelection,
  PlannerRecipe,
} from "./planner.types";

type SelectedDay = { dayKey: string; selection: PlannerDaySelection };

function requirementKey(ingredient: IngredientAvailability) {
  const comparable = ingredient.quantity === null
    ? null
    : comparableRecipeQuantity(ingredient.quantity, ingredient.unit);
  const identity = ingredient.productId
    ? `product:${ingredient.productId}`
    : `name:${[...recipeIngredientIdentityKeys(ingredient.name)].sort()[0] ?? ingredient.name}`;
  return `${identity}|${comparable?.dimension ?? ingredient.unit ?? "unspecified"}`;
}

function convertToUnit(quantity: number, fromUnit: string | null, toUnit: string | null) {
  const from = comparableRecipeQuantity(quantity, fromUnit);
  const target = comparableRecipeQuantity(1, toUnit);
  if (!from || !target || from.dimension !== target.dimension) return null;
  return from.value / target.value;
}

export function aggregatePlannerRequirements(ingredients: IngredientAvailability[]) {
  const grouped = new Map<string, RecipeIngredientInput>();

  for (const ingredient of ingredients) {
    const key = requirementKey(ingredient);
    const current = grouped.get(key);
    if (!current) {
      grouped.set(key, {
        name: ingredient.name,
        quantity: ingredient.quantity,
        unit: ingredient.unit,
        productId: ingredient.productId,
      });
      continue;
    }

    if (ingredient.quantity === null) continue;
    if (current.quantity === null) {
      current.quantity = ingredient.quantity;
      current.unit = ingredient.unit;
      continue;
    }

    const converted = normaliseProductText(ingredient.unit ?? "") === normaliseProductText(current.unit ?? "")
      ? ingredient.quantity
      : convertToUnit(ingredient.quantity, ingredient.unit, current.unit);
    if (converted !== null) current.quantity += converted;
  }

  return [...grouped.values()].sort((left, right) => left.name.localeCompare(right.name));
}

export function calculatePlannerAvailability(
  selectedDays: SelectedDay[],
  recipes: PlannerRecipe[],
  products: RecipeProductIdentity[],
) {
  const recipeById = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const productIndex = createRecipeProductIndex(products);
  const scaledRequirements: IngredientAvailability[] = [];
  const dayAvailability: Record<string, PlannerDayAvailability> = {};

  for (const { dayKey, selection } of selectedDays) {
    const recipe = recipeById.get(selection.recipeId);
    if (!recipe) continue;
    const scale = selection.servings / Math.max(recipe.servings, 1);
    const dayIngredients = recipe.ingredients.map((ingredient) => getIngredientAvailability({
      ...ingredient,
      quantity: ingredient.quantity === null ? null : ingredient.quantity * scale,
    }, productIndex));
    const availableCount = dayIngredients.filter((ingredient) => ingredient.status === "in-pantry").length;
    dayAvailability[dayKey] = {
      availableCount,
      ingredientCount: dayIngredients.length,
      percent: dayIngredients.length ? Math.round((availableCount / dayIngredients.length) * 100) : 0,
    };
    scaledRequirements.push(...dayIngredients);
  }

  const weeklyRequirements = aggregatePlannerRequirements(scaledRequirements)
    .map((ingredient) => getIngredientAvailability(ingredient, productIndex));

  return {
    dayAvailability,
    weeklyRequirements,
    missingIngredients: weeklyRequirements.filter((ingredient) => ingredient.status !== "in-pantry"),
  };
}
