import type { PlannerDayAvailability, PlannerRecipe } from "./planner.types";

export function plannerRecipeCardView(
  recipe: PlannerRecipe,
  availability?: PlannerDayAvailability,
) {
  const ingredientCount = recipe.ingredients.length;
  let sourceLabel = "Food recipe";

  if (recipe.originalSourceName) sourceLabel = recipe.originalSourceName;
  else if (recipe.source === "database") sourceLabel = "Saved recipe";
  else if (recipe.source === "catalogue") sourceLabel = "Recipe collection";

  return {
    imageUrl: recipe.imageUrl,
    sourceLabel,
    ingredientLabel: `${ingredientCount} ingredient${ingredientCount === 1 ? "" : "s"}`,
    pantryPercent: availability?.percent ?? null,
  };
}
