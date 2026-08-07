import type { ExternalRecipe, RecipeMealType } from "./external-recipes";

export const recipeMealTypes: readonly RecipeMealType[] = [
  "Breakfast",
  "Lunch & dinner",
  "Snacks",
  "Desserts",
  "Sides & sauces",
  "Drinks",
];

export function getRecipeMealType(
  recipe: Pick<ExternalRecipe, "mealType" | "tags">,
): RecipeMealType {
  if (recipe.mealType) return recipe.mealType;

  const tags = recipe.tags.map((tag) => tag.toLocaleLowerCase("en-AU"));
  if (tags.includes("breakfast")) return "Breakfast";
  if (tags.includes("snack") || tags.includes("snacks")) return "Snacks";
  if (tags.includes("dessert") || tags.includes("desserts") || tags.includes("sweet")) return "Desserts";
  if (tags.includes("drink") || tags.includes("drinks") || tags.includes("beverage")) return "Drinks";
  if (tags.includes("side") || tags.includes("sauce") || tags.includes("dip")) return "Sides & sauces";
  return "Lunch & dinner";
}
