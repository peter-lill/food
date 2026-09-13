import { NextResponse } from "next/server";
import {
  cacheExternalRecipeImage,
  readCachedRecipeImage,
} from "@/lib/recipes/local-recipe-image";
import { externalRecipes } from "@/lib/recipes/external-recipes";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ recipeId: string }> },
) {
  const { recipeId } = await params;

  let cached = await readCachedRecipeImage(recipeId);

  if (!cached) {
    await cacheExternalRecipeImage(recipeId).catch((error) => {
      console.error(`Unable to cache local recipe image for ${recipeId}`, error);
    });
    cached = await readCachedRecipeImage(recipeId);
  }

  if (!cached || cached.bytes.length === 0) {
    // The local cache is an optimisation, never the only way to render a
    // published recipe. A temporary source fetch or cache-volume failure must
    // not turn a known image into a broken panel in Planner or Recipes.
    const sourceImage = externalRecipes.find((recipe) => recipe.id === recipeId)?.imageUrl;
    if (sourceImage) return NextResponse.redirect(sourceImage, 307);
    return new NextResponse(null, { status: 404 });
  }

  return new NextResponse(cached.bytes, {
    status: 200,
    headers: {
      "Content-Type": cached.contentType,
      "Content-Length": String(cached.bytes.length),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
