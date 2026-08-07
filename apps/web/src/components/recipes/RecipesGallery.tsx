"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { PlannerRecipe } from "@/lib/planner/planner.types";
import type { ExternalRecipe, RecipeMealType } from "@/lib/recipes/external-recipes";
import { getRecipeMealType, recipeMealTypes } from "@/lib/recipes/recipe-meal-types";
import styles from "./recipes-gallery.module.css";
import { BhfRecipeModal } from "./BhfRecipeModal";
import { HwqRecipeModal } from "./HwqRecipeModal";

type RecipesGalleryProps = {
  recipes: PlannerRecipe[];
  externalRecipes: ExternalRecipe[];
  initialFavouriteIds: string[];
  signedIn: boolean;
};

function opensInFood(recipe: ExternalRecipe) {
  return (
    recipe.sourceName === "British Heart Foundation" ||
    recipe.sourceName === "Health and Wellbeing Queensland"
  );
}

export function RecipesGallery({
  recipes,
  externalRecipes,
  initialFavouriteIds,
  signedIn,
}: RecipesGalleryProps) {
  const router = useRouter();
  const [openRecipe, setOpenRecipe] = useState<PlannerRecipe | null>(null);
  const [openExternalRecipe, setOpenExternalRecipe] = useState<ExternalRecipe | null>(null);
  const [recipeQuery, setRecipeQuery] = useState("");
  const [recipeSource, setRecipeSource] = useState("All sources");
  const [recipeMealType, setRecipeMealType] = useState<"All meals" | RecipeMealType>("All meals");
  const [favouriteRecipeIds, setFavouriteRecipeIds] = useState<Set<string>>(
    () => new Set(initialFavouriteIds),
  );
  const [pendingFavouriteIds, setPendingFavouriteIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [favouriteError, setFavouriteError] = useState("");
  const [showFavouritesOnly, setShowFavouritesOnly] = useState(false);

  const recipeSources = useMemo(
    () => ["All sources", ...new Set(externalRecipes.map((recipe) => recipe.sourceName))],
    [externalRecipes],
  );
  const filteredExternalRecipes = useMemo(() => {
    const query = recipeQuery.trim().toLocaleLowerCase();

    return externalRecipes.filter((recipe) => {
      const mealType = getRecipeMealType(recipe);
      const matchesSource =
        recipeSource === "All sources" || recipe.sourceName === recipeSource;
      const matchesMealType =
        recipeMealType === "All meals" || mealType === recipeMealType;
      const matchesFavourite =
        !showFavouritesOnly || favouriteRecipeIds.has(recipe.id);
      const searchableText = [
        recipe.name,
        recipe.description,
        recipe.sourceName,
        mealType,
        ...recipe.tags,
      ].join(" ").toLocaleLowerCase();

      return (
        matchesSource &&
        matchesMealType &&
        matchesFavourite &&
        (!query || searchableText.includes(query))
      );
    });
  }, [
    externalRecipes,
    favouriteRecipeIds,
    recipeMealType,
    recipeQuery,
    recipeSource,
    showFavouritesOnly,
  ]);

  async function toggleFavourite(recipeId: string) {
    if (!signedIn) {
      router.push("/sign-in?callbackURL=%2Frecipes");
      return;
    }
    if (pendingFavouriteIds.has(recipeId)) return;

    const wasFavourite = favouriteRecipeIds.has(recipeId);
    setFavouriteError("");
    setFavouriteRecipeIds((currentIds) => {
      const nextIds = new Set(currentIds);
      if (wasFavourite) nextIds.delete(recipeId);
      else nextIds.add(recipeId);
      return nextIds;
    });
    setPendingFavouriteIds((currentIds) => new Set(currentIds).add(recipeId));

    try {
      const response = await fetch(
        `/api/recipes/favourites/${encodeURIComponent(recipeId)}`,
        { method: wasFavourite ? "DELETE" : "PUT" },
      );
      if (!response.ok) throw new Error("Unable to save that favourite.");
    } catch {
      setFavouriteRecipeIds((currentIds) => {
        const nextIds = new Set(currentIds);
        if (wasFavourite) nextIds.add(recipeId);
        else nextIds.delete(recipeId);
        return nextIds;
      });
      setFavouriteError("Your favourite could not be saved. Please try again.");
    } finally {
      setPendingFavouriteIds((currentIds) => {
        const nextIds = new Set(currentIds);
        nextIds.delete(recipeId);
        return nextIds;
      });
    }
  }

  useEffect(() => {
    if (!openRecipe && !openExternalRecipe) return;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenRecipe(null);
        setOpenExternalRecipe(null);
      }
    }

    document.addEventListener("keydown", closeOnEscape);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = "";
    };
  }, [openRecipe, openExternalRecipe]);

  return (
    <>
      <section className={styles.savedSection}>
        <div className={styles.sectionHeading}>
          <div>
            <p className="eyebrow">FULL RECIPE CARDS</p>
            <h2>Food&apos;s complete recipes</h2>
            <p className="subtle">
              These recipe cards are public and include ingredients and cooking methods.
            </p>
          </div>
          <span className="badge neutral">{recipes.length} complete</span>
        </div>

        <div className={styles.gallery}>
          {recipes.length === 0 ? (
            <div className={`card ${styles.empty}`}>
              <strong>No complete recipe cards yet.</strong>
              <p className="subtle">Published recipe cards will appear here for everyone.</p>
            </div>
          ) : (
            recipes.map((recipe) => (
              <article className={styles.card} key={recipe.id}>
                {recipe.imageUrl ? (
                  <div className={styles.cardImage}>
                    <Image
                      alt={`Finished ${recipe.name}`}
                      fill
                      sizes="(max-width: 760px) 126px, (max-width: 1180px) 32vw, 230px"
                      src={recipe.imageUrl}
                    />
                  </div>
                ) : (
                  <div aria-hidden="true" className={styles.imageFallback}>◇</div>
                )}

                <div className={styles.cardContent}>
                  <h2>{recipe.name}</h2>
                  {recipe.description ? <p className={styles.description}>{recipe.description}</p> : null}
                  <div className={styles.meta}>
                    {recipe.minutes ? <span>{recipe.minutes} min</span> : null}
                    <span>{recipe.servings} serving{recipe.servings === 1 ? "" : "s"}</span>
                    {recipe.proteinGrams ? <span>{Math.round(recipe.proteinGrams)} g protein</span> : null}
                  </div>
                  <span className={styles.openLabel}>View recipe →</span>
                </div>

                <button
                  aria-label={`Open recipe for ${recipe.name}`}
                  className={styles.cardAction}
                  onClick={() => setOpenRecipe(recipe)}
                  type="button"
                />
              </article>
            ))
          )}
        </div>
      </section>

      {externalRecipes.length > 0 ? (
        <section className={styles.catalogueSection}>
          <div className={styles.sectionHeading}>
            <div>
              <p className="eyebrow">HEALTHY RECIPE COLLECTIONS</p>
              <h2>Explore {externalRecipes.length} recipes by meal</h2>
              <p className="subtle">
                Search by ingredient, choose a meal type or filter trusted publishers.
              </p>
            </div>
            <span className="badge neutral">{externalRecipes.length} recipes</span>
          </div>

          <div className={styles.recipeTools}>
            <label className={styles.searchField}>
              <span>Search recipes</span>
              <input
                onChange={(event) => setRecipeQuery(event.target.value)}
                placeholder="Try oats, salmon, lentils…"
                type="search"
                value={recipeQuery}
              />
            </label>
            <div aria-label="Filter recipes by meal" className={styles.sourceFilters}>
              <button
                aria-pressed={recipeMealType === "All meals"}
                className={recipeMealType === "All meals" ? styles.sourceFilterActive : styles.sourceFilter}
                onClick={() => setRecipeMealType("All meals")}
                type="button"
              >
                All meals
              </button>
              {recipeMealTypes.map((mealType) => (
                <button
                  aria-pressed={recipeMealType === mealType}
                  className={recipeMealType === mealType ? styles.sourceFilterActive : styles.sourceFilter}
                  key={mealType}
                  onClick={() => setRecipeMealType(mealType)}
                  type="button"
                >
                  {mealType}
                </button>
              ))}
            </div>
            <div aria-label="Filter recipes by source" className={styles.sourceFilters}>
              {signedIn ? (
                <button
                  aria-pressed={showFavouritesOnly}
                  className={
                    showFavouritesOnly
                      ? styles.favouriteFilterActive
                      : styles.favouriteFilter
                  }
                  onClick={() => setShowFavouritesOnly((current) => !current)}
                  type="button"
                >
                  <span aria-hidden="true">♥</span>
                  Favourites
                  {favouriteRecipeIds.size > 0 ? ` ${favouriteRecipeIds.size}` : ""}
                </button>
              ) : null}
              {recipeSources.map((source) => (
                <button
                  aria-pressed={recipeSource === source}
                  className={recipeSource === source ? styles.sourceFilterActive : styles.sourceFilter}
                  key={source}
                  onClick={() => setRecipeSource(source)}
                  type="button"
                >
                  {source}
                </button>
              ))}
            </div>
            <p aria-live="polite" className={styles.resultCount}>
              Showing {filteredExternalRecipes.length} of {externalRecipes.length} recipes
            </p>
            {!signedIn ? (
              <p className={styles.signInHint}>
                <a href="/sign-in?callbackURL=%2Frecipes">Sign in or create an account</a>
                {" "}to save favourites across your devices.
              </p>
            ) : null}
            {favouriteError ? (
              <p className={styles.favouriteError} role="alert">{favouriteError}</p>
            ) : null}
          </div>

          <div className={styles.gallery}>
            {filteredExternalRecipes.map((recipe) => (
              <article className={styles.card} key={recipe.id}>
                {recipe.imageUrl ? (
                  <div
                    aria-label={`Finished ${recipe.name}`}
                    className={styles.externalImage}
                    role="img"
                    style={{ backgroundImage: `url("${recipe.imageUrl}")` }}
                  />
                ) : (
                  <div aria-hidden="true" className={styles.imageFallback}>◇</div>
                )}

                <div className={styles.cardContent}>
                  <span className={styles.source}>{recipe.sourceName}</span>
                  <h2>{recipe.name}</h2>
                  <p className={styles.description}>{recipe.description}</p>
                  <div className={styles.meta}>
                    <span>{getRecipeMealType(recipe)}</span>
                    {recipe.minutes ? <span>{recipe.minutes} min</span> : null}
                    {recipe.servings ? <span>{recipe.servings} servings</span> : null}
                    {recipe.tags.slice(0, 2).map((tag) => <span key={tag}>{tag}</span>)}
                  </div>
                  <span className={styles.openLabel}>
                    {opensInFood(recipe) ? "View recipe details →" : `View on ${recipe.sourceName} ↗`}
                  </span>
                  <p className={styles.attribution}>
                    Recipe by <a href={recipe.sourceHomeUrl}>{recipe.sourceName}</a> · {recipe.licence}
                  </p>
                </div>

                {opensInFood(recipe) ? (
                  <button
                    aria-label={`Open ${recipe.name}`}
                    className={styles.cardAction}
                    onClick={() => setOpenExternalRecipe(recipe)}
                    type="button"
                  />
                ) : (
                  <a
                    aria-label={`View ${recipe.name} on ${recipe.sourceName}`}
                    className={styles.cardAction}
                    href={recipe.sourceUrl}
                    rel="noopener noreferrer"
                    target="_blank"
                  />
                )}
                <button
                  aria-label={
                    favouriteRecipeIds.has(recipe.id)
                      ? `Remove ${recipe.name} from favourites`
                      : `Save ${recipe.name} as a favourite`
                  }
                  aria-pressed={favouriteRecipeIds.has(recipe.id)}
                  className={
                    favouriteRecipeIds.has(recipe.id)
                      ? styles.favouriteButtonActive
                      : styles.favouriteButton
                  }
                  onClick={() => toggleFavourite(recipe.id)}
                  disabled={pendingFavouriteIds.has(recipe.id)}
                  title={
                    !signedIn
                      ? "Sign in to save as a favourite"
                      : favouriteRecipeIds.has(recipe.id)
                      ? "Remove from favourites"
                      : "Save as favourite"
                  }
                  type="button"
                >
                  <span aria-hidden="true">
                    {favouriteRecipeIds.has(recipe.id) ? "♥" : "♡"}
                  </span>
                </button>
              </article>
            ))}
            {filteredExternalRecipes.length === 0 ? (
              <div className={`card ${styles.empty}`}>
                <strong>
                  {showFavouritesOnly ? "No favourite recipes yet." : "No matching recipes."}
                </strong>
                <p className="subtle">
                  {showFavouritesOnly
                    ? "Tap the heart on a recipe to save it here."
                    : "Try another ingredient, meal type or source."}
                </p>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {openExternalRecipe?.sourceName === "British Heart Foundation" ? (
        <BhfRecipeModal
          onClose={() => setOpenExternalRecipe(null)}
          recipe={openExternalRecipe}
        />
      ) : null}

      {openExternalRecipe?.sourceName === "Health and Wellbeing Queensland" ? (
        <HwqRecipeModal
          onClose={() => setOpenExternalRecipe(null)}
          recipe={openExternalRecipe}
        />
      ) : null}

      {openRecipe ? (
        <div className={styles.backdrop} onClick={() => setOpenRecipe(null)}>
          <article
            aria-labelledby="recipe-dialog-title"
            aria-modal="true"
            className={styles.modal}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <button
              aria-label="Close recipe"
              className={styles.close}
              onClick={() => setOpenRecipe(null)}
              type="button"
            >
              ×
            </button>

            {openRecipe.imageUrl ? (
              <div className={styles.hero}>
                <Image
                  alt={`Finished ${openRecipe.name}`}
                  fill
                  priority
                  sizes="(max-width: 760px) 100vw, 940px"
                  src={openRecipe.imageUrl}
                />
              </div>
            ) : (
              <div aria-hidden="true" className={styles.heroFallback}>◇</div>
            )}

            <div className={styles.modalContent}>
              <div>
                <p className="eyebrow">RECIPE</p>
                <h2 className={styles.modalTitle} id="recipe-dialog-title">{openRecipe.name}</h2>
                {openRecipe.description ? <p className="subtle">{openRecipe.description}</p> : null}
              </div>

              <div className={styles.summary}>
                {openRecipe.minutes ? <span><strong>{openRecipe.minutes}</strong> minutes</span> : null}
                <span><strong>{openRecipe.servings}</strong> servings</span>
                {openRecipe.proteinGrams ? <span><strong>{Math.round(openRecipe.proteinGrams)}</strong> g protein</span> : null}
              </div>

              <section className={styles.recipeSection}>
                <h3>Ingredients</h3>
                {openRecipe.ingredients.length > 0 ? (
                  <ul className={styles.ingredients}>
                    {openRecipe.ingredients.map((ingredient, index) => (
                      <li key={`${ingredient.name}-${index}`}>
                        <strong>{ingredient.quantity} {ingredient.unit}</strong>
                        <span>{ingredient.name}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="subtle">No ingredients are available for this recipe yet.</p>
                )}
              </section>

              <section className={styles.recipeSection}>
                <h3>Method</h3>
                {openRecipe.instructions.length > 0 ? (
                  <ol className={styles.instructions}>
                    {openRecipe.instructions.map((instruction, index) => (
                      <li key={`${instruction}-${index}`}>{instruction}</li>
                    ))}
                  </ol>
                ) : (
                  <p className="subtle">No cooking method is available for this recipe yet.</p>
                )}
              </section>

              {openRecipe.originalSourceUrl ? (
                <p className={styles.attribution}>
                  Original source: {openRecipe.originalSourceName ? `${openRecipe.originalSourceName} · ` : ""}
                  <a href={openRecipe.originalSourceUrl} rel="noopener noreferrer" target="_blank">
                    View original recipe ↗
                  </a>
                </p>
              ) : null}
            </div>
          </article>
        </div>
      ) : null}
    </>
  );
}
