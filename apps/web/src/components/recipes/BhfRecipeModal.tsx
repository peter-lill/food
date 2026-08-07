"use client";

import bhfCatalogue from "@/generated/bhf-recipes.json";
import type { ExternalRecipe } from "@/lib/recipes/external-recipes";
import type { IngredientAvailability } from "@/lib/recipes/recipe-pantry";
import styles from "./recipes-gallery.module.css";
import { RecipeIngredientAvailability } from "./RecipeIngredientAvailability";

type BhfRecipeModalProps = {
  recipe: ExternalRecipe;
  onClose: () => void;
  availability: IngredientAvailability[];
  shoppingLists: Array<{ id: string; name: string }>;
};

type BhfCatalogueRecipe = (typeof bhfCatalogue.recipes)[number];

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&ndash;/gi, "–")
    .replace(/&mdash;/gi, "—")
    .replace(/&frac14;/gi, "¼")
    .replace(/&frac12;/gi, "½")
    .replace(/&frac34;/gi, "¾")
    .replace(/&rsquo;/gi, "’")
    .replace(/&lsquo;/gi, "‘")
    .replace(/&ldquo;/gi, "“")
    .replace(/&rdquo;/gi, "”");
}

export function BhfRecipeModal({ recipe, onClose, availability, shoppingLists }: BhfRecipeModalProps) {
  const fullRecipe = bhfCatalogue.recipes.find(
    (candidate) => candidate.id === recipe.id,
  ) as BhfCatalogueRecipe | undefined;

  const ingredients = fullRecipe?.ingredients ?? [];
  const instructions = fullRecipe?.instructions ?? [];
  const nutrition = fullRecipe?.nutrition ?? recipe.nutrition ?? null;
  const imageUrl = fullRecipe?.imageUrl ?? recipe.imageUrl;

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <article
        aria-labelledby="bhf-recipe-dialog-title"
        aria-modal="true"
        className={styles.modal}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <button
          aria-label="Close recipe"
          className={styles.close}
          onClick={onClose}
          type="button"
        >
          ×
        </button>

        {imageUrl ? (
          <div
            aria-label={`Finished ${recipe.name}`}
            className={styles.hero}
            role="img"
            style={{
              backgroundImage: `url("${imageUrl}")`,
              backgroundPosition: "center",
              backgroundRepeat: "no-repeat",
              backgroundSize: "cover",
            }}
          />
        ) : (
          <div aria-hidden="true" className={styles.heroFallback}>◇</div>
        )}

        <div className={styles.modalContent}>
          <div>
            <p className="eyebrow">BRITISH HEART FOUNDATION</p>
            <h2 className={styles.modalTitle} id="bhf-recipe-dialog-title">
              {recipe.name}
            </h2>
            {recipe.description ? <p className="subtle">{recipe.description}</p> : null}
          </div>

          <div className={styles.summary}>
            {recipe.prepMinutes ? <span><strong>{recipe.prepMinutes}</strong> min prep</span> : null}
            {recipe.cookMinutes ? <span><strong>{recipe.cookMinutes}</strong> min cook</span> : null}
            {recipe.minutes ? <span><strong>{recipe.minutes}</strong> min total</span> : null}
            {recipe.servings ? <span><strong>{recipe.servings}</strong> servings</span> : null}
          </div>

          {nutrition ? (
            <section className={styles.recipeSection}>
              <h3>Nutrition per serving</h3>
              <div className={styles.summary}>
                {nutrition.energyKj != null ? <span><strong>{Math.round(nutrition.energyKj)}</strong> kJ</span> : null}
                {nutrition.calories != null ? <span><strong>{Math.round(nutrition.calories)}</strong> kcal</span> : null}
                {nutrition.carbsGrams != null ? <span><strong>{nutrition.carbsGrams}</strong> g carbs</span> : null}
                {nutrition.fibreGrams != null ? <span><strong>{nutrition.fibreGrams}</strong> g fibre</span> : null}
                {nutrition.fatGrams != null ? <span><strong>{nutrition.fatGrams}</strong> g fat</span> : null}
                {nutrition.saturatedFatGrams != null ? <span><strong>{nutrition.saturatedFatGrams}</strong> g saturates</span> : null}
                {nutrition.sugarGrams != null ? <span><strong>{nutrition.sugarGrams}</strong> g sugar</span> : null}
                {nutrition.saltGrams != null ? <span><strong>{nutrition.saltGrams}</strong> g salt</span> : null}
              </div>
            </section>
          ) : null}

          <section className={styles.recipeSection}>
            <h3>Ingredients</h3>
            {ingredients.length ? (
              <RecipeIngredientAvailability
                availability={availability}
                ingredientLabels={ingredients.map(decodeHtml)}
                shoppingLists={shoppingLists}
              />
            ) : (
              <p className="subtle">Ingredients are not available for this recipe yet.</p>
            )}
          </section>

          <section className={styles.recipeSection}>
            <h3>Method</h3>
            {instructions.length ? (
              <ol className={styles.instructions}>
                {instructions.map((instruction, index) => (
                  <li key={`${recipe.id}-step-${index}`}>
                    {decodeHtml(instruction)}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="subtle">Method is not available for this recipe yet.</p>
            )}
          </section>

          {recipe.tags.length ? (
            <section className={styles.recipeSection}>
              <h3>Categories</h3>
              <div className={styles.meta}>
                {recipe.tags.map((tag) => <span key={tag}>{tag}</span>)}
              </div>
            </section>
          ) : null}

          <p className={styles.attribution}>
            Original source: British Heart Foundation ·{" "}
            <a href={recipe.sourceUrl} rel="noopener noreferrer" target="_blank">
              View original recipe ↗
            </a>
          </p>
        </div>
      </article>
    </div>
  );
}
