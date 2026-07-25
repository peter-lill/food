import { RecipesGallery } from "@/components/recipes/RecipesGallery";
import { getAuthSession } from "@/lib/auth-session";
import { getPlannerWorkspace } from "@/lib/planner/planner.repository";
import { prisma } from "@/lib/prisma";
import { externalRecipes } from "@/lib/recipes/external-recipes";
import { importHeartFoundationRecipe } from "@/lib/recipes/import-heart-foundation-recipe";
import { cacheExternalRecipeImage } from "@/lib/recipes/local-recipe-image";
import { withSourceImage } from "@/lib/recipes/recipe-image";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Food Recipes",
  description: "Browse complete recipes, ingredients and cooking methods.",
};

async function materialiseHeartFoundationRecipes() {
  const existing = await prisma.recipe.findMany({ select: { name: true } });
  const existingNames = new Set(existing.map((recipe) => recipe.name));
  const missing = externalRecipes.filter(
    (recipe) => recipe.sourceName === "Heart Foundation" && !existingNames.has(recipe.name),
  );

  const batchSize = 4;
  for (let index = 0; index < missing.length; index += batchSize) {
    const batch = missing.slice(index, index + batchSize);
    await Promise.allSettled(
      batch.map(async (recipe) => {
        await importHeartFoundationRecipe(recipe.id);
        await cacheExternalRecipeImage(recipe.id).catch((error) => {
          console.error(`Unable to cache image for ${recipe.id}`, error);
        });
      }),
    );
  }
}

export default async function RecipesPage() {
  const session = await getAuthSession();

  try {
    await materialiseHeartFoundationRecipes();
  } catch (error) {
    console.error("Unable to materialise Heart Foundation recipe catalogue", error);
  }

  const { recipes: plannerRecipes } = await getPlannerWorkspace();
  const completeRecipes = plannerRecipes.filter((recipe) => recipe.source !== "external");
  const completeRecipeNames = new Set(completeRecipes.map((recipe) => recipe.name));
  const catalogueRecipes = [
    ...new Map(
      externalRecipes
        // Mayo's individual recipe pages expose recipe text but not a usable
        // dish photo. Do not show blank cards (or generic Mayo branding) in
        // the visual catalogue; keep sources with actual recipe photography.
        .filter((recipe) => recipe.sourceName !== "Mayo Clinic")
        // Successfully imported Heart Foundation recipes are now full Food
        // recipe cards. Only keep a source card when an import could not be
        // materialised so the recipe is not silently lost from the library.
        .filter(
          (recipe) =>
            recipe.sourceName !== "Heart Foundation" || !completeRecipeNames.has(recipe.name),
        )
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
