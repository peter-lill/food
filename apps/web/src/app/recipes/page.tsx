import { RecipesGallery } from "@/components/recipes/RecipesGallery";
import { getAuthSession } from "@/lib/auth-session";
import { getPlannerWorkspace } from "@/lib/planner/planner.repository";
import { prisma } from "@/lib/prisma";
import { externalRecipes } from "@/lib/recipes/external-recipes";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Food Recipes",
  description: "Browse complete recipes, ingredients and cooking methods.",
};

export default async function RecipesPage() {
  const [{ recipes }, session] = await Promise.all([
    getPlannerWorkspace(),
    getAuthSession(),
  ]);
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
            Search a curated low-cholesterol collection, then open a recipe on its trusted source.
          </p>
        </div>
        <span className="badge neutral">
          {recipes.length + externalRecipes.length} recipe{recipes.length + externalRecipes.length === 1 ? "" : "s"}
        </span>
      </header>

      <RecipesGallery
        externalRecipes={externalRecipes}
        initialFavouriteIds={favourites.map((favourite) => favourite.externalRecipeId)}
        recipes={recipes}
        signedIn={Boolean(session)}
      />
    </div>
  );
}
