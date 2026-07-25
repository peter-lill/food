import { RecipesGallery } from "@/components/recipes/RecipesGallery";
import { getPlannerWorkspace } from "@/lib/planner/planner.repository";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Food Recipes",
  description: "Browse complete recipes, ingredients and cooking methods.",
};

export default async function RecipesPage() {
  const { recipes } = await getPlannerWorkspace();

  return (
    <div>
      <header className="pantry-page-heading">
        <div>
          <p className="eyebrow">RECIPE LIBRARY</p>
          <h1 className="page-title">Recipes</h1>
          <p className="subtle">
            Choose a finished dish to see its ingredients and cooking method.
          </p>
        </div>
        <span className="badge neutral">
          {recipes.length} recipe{recipes.length === 1 ? "" : "s"}
        </span>
      </header>

      <RecipesGallery recipes={recipes} />
    </div>
  );
}
