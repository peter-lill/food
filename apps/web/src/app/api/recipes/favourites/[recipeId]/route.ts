import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { externalRecipes } from "@/lib/recipes/external-recipes";

type FavouriteRouteContext = {
  params: Promise<{ recipeId: string }>;
};

async function getValidatedRequest(
  request: NextRequest,
  context: FavouriteRouteContext,
) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return { error: "Unauthorised" as const };

  const { recipeId } = await context.params;
  const recipeExists = externalRecipes.some((recipe) => recipe.id === recipeId);
  if (!recipeExists) return { error: "Recipe not found" as const };

  return { session, recipeId };
}

export async function PUT(
  request: NextRequest,
  context: FavouriteRouteContext,
) {
  const validated = await getValidatedRequest(request, context);

  if ("error" in validated) {
    return NextResponse.json(
      { error: validated.error },
      { status: validated.error === "Unauthorised" ? 401 : 404 },
    );
  }

  await prisma.recipeFavourite.upsert({
    where: {
      userId_externalRecipeId: {
        userId: validated.session.user.id,
        externalRecipeId: validated.recipeId,
      },
    },
    create: {
      userId: validated.session.user.id,
      externalRecipeId: validated.recipeId,
    },
    update: {},
  });

  return NextResponse.json({ favourite: true });
}

export async function DELETE(
  request: NextRequest,
  context: FavouriteRouteContext,
) {
  const validated = await getValidatedRequest(request, context);

  if ("error" in validated) {
    return NextResponse.json(
      { error: validated.error },
      { status: validated.error === "Unauthorised" ? 401 : 404 },
    );
  }

  await prisma.recipeFavourite.deleteMany({
    where: {
      userId: validated.session.user.id,
      externalRecipeId: validated.recipeId,
    },
  });

  return NextResponse.json({ favourite: false });
}
