import Image from "next/image";
import { getPlannerWorkspace } from "@/lib/planner/planner.repository";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Food Recipes",
  description: "Browse complete recipes, ingredients and cooking methods.",
};

export default async function RecipesPage() {
  const { recipes } = await getPlannerWorkspace();

  return (
    <>
      <header className="pantry-page-heading">
        <div>
          <p className="eyebrow">RECIPE LIBRARY</p>
          <h1 className="page-title">Recipes</h1>
          <p className="subtle">Tap a recipe to see the finished meal, ingredients and method.</p>
        </div>
      </header>

      <div className="grid">
        {recipes.map((recipe) => (
          <details className="card span-4" key={recipe.id}>
            <summary className="button">
              {recipe.name}
            </summary>

            {recipe.imageUrl ? (
              <div style={{ marginTop: 16, overflow: "hidden", borderRadius: 16 }}>
                <Image
                  alt={`Finished ${recipe.name}`}
                  height={720}
                  sizes="(max-width: 760px) 100vw, 520px"
                  src={recipe.imageUrl}
                  style={{ display: "block", height: "auto", objectFit: "cover", width: "100%" }}
                  width={1080}
                />
              </div>
            ) : null}

            {recipe.description ? <p>{recipe.description}</p> : null}
            <p className="subtle">
              {recipe.minutes ? `${recipe.minutes} minutes · ` : ""}
              {recipe.servings} serving{recipe.servings === 1 ? "" : "s"}
              {recipe.proteinGrams ? ` · ${Math.round(recipe.proteinGrams)} g protein` : ""}
            </p>

            <h2>Ingredients</h2>
            {recipe.ingredients.length > 0 ? (
              <ul>
                {recipe.ingredients.map((ingredient) => (
                  <li key={`${ingredient.name}-${ingredient.unit}`}>
                    {ingredient.quantity} {ingredient.unit} {ingredient.name}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="subtle">No ingredients have been saved for this recipe yet.</p>
            )}

            <h2>Method</h2>
            {recipe.instructions.length > 0 ? (
              <ol>
                {recipe.instructions.map((instruction, index) => (
                  <li key={`${index}-${instruction}`}>{instruction}</li>
                ))}
              </ol>
            ) : (
              <p className="subtle">No cooking method has been saved for this recipe yet.</p>
            )}
          </details>
        ))}
      </div>
    </>
  );
}
