import { RecipesGallery } from "@/components/recipes/RecipesGallery";
import { getAuthSession } from "@/lib/auth-session";
import { getPlannerWorkspace } from "@/lib/planner/planner.repository";
import { prisma } from "@/lib/prisma";
import { getAuditedExternalRecipes } from "@/lib/recipes/catalogue-audit";
import { withSourceImage } from "@/lib/recipes/recipe-image";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Food Recipes",
  description: "Browse complete recipes, ingredients and cooking methods.",
};

export default async function RecipesPage() {
  const [{ recipes: plannerRecipes }, session, auditedRecipes] = await Promise.all([
    getPlannerWorkspace(),
    getAuthSession(),
    getAuditedExternalRecipes(),
  ]);

  const completeRecipes = plannerRecipes.filter((recipe) => recipe.source !== "external");
  const catalogueRecipes = [
    ...new Map(
      auditedRecipes
        .map(withSourceImage)
        .map((recipe) => [recipe.id, recipe] as const),
    ).values(),
  ];
  const totalRecipeCount = completeRecipes.length + catalogueRecipes.length;

  const favourites = session
    ? await prisma.recipeFavourite.findMany({
        where: { userId: session.user.id },
        select: { externalRecipeId: true },
      })
    : [];

  return (
    <div>
      <header className="pantry-page-heading">
        <div>
          <p className="eyebrow">RECIPE LIBRARY</p>
          <h1 className="page-title">Recipes</h1>
          <p className="subtle">
            Search a checked low-cholesterol collection. Broken pages and recipes without a working food image are automatically excluded.
          </p>
        </div>
        <span className="badge neutral">
          {totalRecipeCount} recipe{totalRecipeCount === 1 ? "" : "s"}
        </span>
      </header>

      <RecipesGallery
        externalRecipes={catalogueRecipes}
        initialFavouriteIds={favourites.map((favourite) => favourite.externalRecipeId)}
        recipes={completeRecipes}
        signedIn={Boolean(session)}
      />
    </div>
  );
}
