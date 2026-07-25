import type { ExternalRecipe } from "./external-recipes";

export function withSourceImage(recipe: ExternalRecipe): ExternalRecipe {
  if (recipe.imageUrl) return recipe;

  return {
    ...recipe,
    imageUrl: `/api/recipes/source-image?url=${encodeURIComponent(recipe.sourceUrl)}`,
  };
}
