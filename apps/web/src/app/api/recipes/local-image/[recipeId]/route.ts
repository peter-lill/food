import { NextResponse } from "next/server";
import { readCachedRecipeImage } from "@/lib/recipes/local-recipe-image";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ recipeId: string }> },
) {
  const { recipeId } = await params;
  const cached = await readCachedRecipeImage(recipeId);
  if (!cached) return new NextResponse(null, { status: 404 });

  return new NextResponse(cached.bytes, {
    status: 200,
    headers: {
      "Content-Type": cached.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
