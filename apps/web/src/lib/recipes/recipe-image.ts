import type { ExternalRecipe } from "./external-recipes";

const sourceImageVersion = "3";

export function withSourceImage(recipe: ExternalRecipe): ExternalRecipe {
  return {
    ...recipe,
    imageUrl: `/api/recipes/local-image/${encodeURIComponent(recipe.id)}?v=${sourceImageVersion}`,
  };
}
