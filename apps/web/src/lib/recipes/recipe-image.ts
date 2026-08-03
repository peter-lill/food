import type { ExternalRecipe } from "./external-recipes";

const sourceImageVersion = "3";

export function withSourceImage(recipe: ExternalRecipe): ExternalRecipe {
  if (recipe.imageUrl) return recipe;

  return {
    ...recipe,
    imageUrl: `/api/recipes/source-image?v=${sourceImageVersion}&url=${encodeURIComponent(recipe.sourceUrl)}`,
  };
}
