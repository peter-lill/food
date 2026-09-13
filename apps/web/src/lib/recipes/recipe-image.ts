import type { ExternalRecipe } from "./external-recipes";

const sourceImageVersion = "3";

export function sourceImageUrl(recipeId: string) {
  return `/api/recipes/local-image/${encodeURIComponent(recipeId)}?v=${sourceImageVersion}`;
}

export function withSourceImage(recipe: ExternalRecipe): ExternalRecipe {
  return {
    ...recipe,
    imageUrl: sourceImageUrl(recipe.id),
  };
}
