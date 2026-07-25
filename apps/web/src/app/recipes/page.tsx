import { RecipesGallery } from "@/components/recipes/RecipesGallery";
import { getAuthSession } from "@/lib/auth-session";
import { getPlannerWorkspace } from "@/lib/planner/planner.repository";
import { prisma } from "@/lib/prisma";
import { externalRecipes } from "@/lib/recipes/external-recipes";
import { withSourceImage } from "@/lib/recipes/recipe-image";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Food Recipes",
  description: "Browse complete recipes, ingredients and cooking methods.",
};

export default async function RecipesPage() {
  const [{ recipes: plannerRecipes }, session] = await Promise.all([
    getPlannerWorkspace(),
    getAuthSession(),
  ]);

  const completeRecipes = plannerRecipes.filter((recipe) => recipe.source !== "external");
  const catalogueRecipes = [
    ...new Map(
      externalRecipes
        // Mayo's individual recipe pages expose recipe text but not a usable
        // dish photo. Do not show blank cards (or generic Mayo branding) in
        // the visual catalogue; keep sources with actual recipe photography.
        .filter((recipe) => recipe.sourceName !== "Mayo Clinic")
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
            Search the full photographed low-cholesterol collection. Sources without a usable dish image are excluded.
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
