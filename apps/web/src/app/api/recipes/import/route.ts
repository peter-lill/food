import { NextRequest, NextResponse } from "next/server";
import { requireAuthSession } from "@/lib/auth-session";
import { importHeartFoundationRecipe } from "@/lib/recipes/import-heart-foundation-recipe";
import { cacheExternalRecipeImage } from "@/lib/recipes/local-recipe-image";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  await requireAuthSession();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const externalRecipeId =
    body && typeof body === "object" && "externalRecipeId" in body
      ? (body as { externalRecipeId?: unknown }).externalRecipeId
      : null;

  if (typeof externalRecipeId !== "string" || !externalRecipeId.trim()) {
    return NextResponse.json({ error: "externalRecipeId is required." }, { status: 400 });
  }

  try {
    const recipe = await importHeartFoundationRecipe(externalRecipeId);
    const imageUrl = await cacheExternalRecipeImage(externalRecipeId).catch((error) => {
      console.error("Unable to cache imported recipe image", error);
      return null;
    });
    return NextResponse.json({ recipeId: recipe.id, imageUrl });
  } catch (error) {
    console.error("External recipe import failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to import this recipe." },
      { status: 422 },
    );
  }
}
