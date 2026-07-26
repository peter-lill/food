import { AustralianHeartFoundationRecipes } from "@/components/recipes/AustralianHeartFoundationRecipes";
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

async function materialiseAustralianHeartFoundationRecipes() {
  const australianHeartFoundationRecipes = externalRecipes.filter(
    (recipe) => recipe.sourceName === "Heart Foundation",
  );

  const batchSize = 4;
  for (let index = 0; index < australianHeartFoundationRecipes.length; index += batchSize) {
    const batch = australianHeartFoundationRecipes.slice(index, index + batchSize);
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
    await materialiseAustralianHeartFoundationRecipes();
  } catch (error) {
    console.error("Unable to materialise Australian Heart Foundation recipe catalogue", error);
  }

  const { recipes: plannerRecipes } = await getPlannerWorkspace();
  const databaseRecipes = plannerRecipes.filter((recipe) => recipe.source !== "external");
  const australianHeartFoundationRecipes = databaseRecipes.filter((recipe) =>
    recipe.sourceKey?.startsWith("heart-foundation:"),
  );
  const completeRecipes = databaseRecipes.filter((recipe) =>
    !recipe.sourceKey?.startsWith("heart-foundation:"),
  );

  const importedAustralianHeartFoundationKeys = new Set(
    australianHeartFoundationRecipes
      .map((recipe) => recipe.sourceKey)
      .filter((sourceKey): sourceKey is string => Boolean(sourceKey)),
  );

  const catalogueRecipes = [
    ...new Map(
      externalRecipes
        .filter((recipe) => recipe.sourceName !== "Mayo Clinic")
        .filter(
          (recipe) =>
            recipe.sourceName !== "Heart Foundation" ||
            !importedAustralianHeartFoundationKeys.has(`heart-foundation:${recipe.id}`),
        )
        .map(withSourceImage)
        .map((recipe) => [recipe.id, recipe] as const),
    ).values(),
  ];
  const totalRecipeCount = completeRecipes.length + australianHeartFoundationRecipes.length + catalogueRecipes.length;

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
            Search Food recipes and separate collections from the Australian and British Heart Foundations.
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

      <AustralianHeartFoundationRecipes recipes={australianHeartFoundationRecipes} />
    </div>
  );
}
