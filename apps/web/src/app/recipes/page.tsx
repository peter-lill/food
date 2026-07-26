import { RecipesGallery } from "@/components/recipes/RecipesGallery";
import { getAuthSession } from "@/lib/auth-session";
import { getPlannerWorkspace } from "@/lib/planner/planner.repository";
import { prisma } from "@/lib/prisma";
import {
  externalRecipes,
  type ExternalRecipe,
} from "@/lib/recipes/external-recipes";
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

function isAustralianHeartFoundationRecipe(recipe: {
  sourceKey?: string | null;
  originalSourceName?: string | null;
}) {
  return (
    recipe.sourceKey?.startsWith("heart-foundation:") === true ||
    recipe.originalSourceName === "Heart Foundation" ||
    recipe.originalSourceName === "Australian Heart Foundation"
  );
}

function prepareCatalogueRecipe(recipe: ExternalRecipe): ExternalRecipe {
  const preparedRecipe = withSourceImage(recipe);

  if (preparedRecipe.sourceName !== "Heart Foundation") {
    return preparedRecipe;
  }

  return {
    ...preparedRecipe,
    sourceName: "Australian Heart Foundation",
  };
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
  const completeRecipes = databaseRecipes.filter(
    (recipe) => !isAustralianHeartFoundationRecipe(recipe),
  );

  const catalogueRecipes: ExternalRecipe[] = [
    ...new Map(
      externalRecipes
        .filter((recipe) => recipe.sourceName !== "Mayo Clinic")
        .map(prepareCatalogueRecipe)
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
          <p className="subtle">Browse heart-conscious recipes, ingredients and cooking inspiration.</p>
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
