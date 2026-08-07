export const recipeMealTypes = [
  "Breakfast",
  "Lunch & dinner",
  "Snacks",
  "Desserts",
  "Sides & sauces",
  "Drinks",
] as const;

export type RecipeMealType = (typeof recipeMealTypes)[number];

type RecipeMealClassificationInput = {
  mealType?: RecipeMealType;
  tags: readonly string[];
};

export function getRecipeMealType(recipe: RecipeMealClassificationInput): RecipeMealType {
  if (recipe.mealType) return recipe.mealType;

  const tags = recipe.tags.map((tag) => tag.toLocaleLowerCase("en-AU"));
  if (tags.includes("breakfast")) return "Breakfast";
  if (tags.includes("snack") || tags.includes("snacks")) return "Snacks";
  if (tags.includes("dessert") || tags.includes("desserts") || tags.includes("sweet")) return "Desserts";
  if (tags.includes("drink") || tags.includes("drinks") || tags.includes("beverage")) return "Drinks";
  if (tags.includes("side") || tags.includes("sauce") || tags.includes("dip")) return "Sides & sauces";
  return "Lunch & dinner";
}
