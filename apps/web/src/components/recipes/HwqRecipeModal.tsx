"use client";

import type { ExternalRecipe } from "@/lib/recipes/external-recipes";
import { hwqSnackRecipes } from "@/lib/recipes/hwq-snacks";
import type { IngredientAvailability } from "@/lib/recipes/recipe-pantry";
import styles from "./recipes-gallery.module.css";
import { RecipeIngredientAvailability } from "./RecipeIngredientAvailability";

type HwqRecipeModalProps = {
  recipe: ExternalRecipe;
  onClose: () => void;
  availability: IngredientAvailability[];
  shoppingLists: Array<{ id: string; name: string }>;
};

export function HwqRecipeModal({ recipe, onClose, availability, shoppingLists }: HwqRecipeModalProps) {
  const fullRecipe = hwqSnackRecipes.find((candidate) => candidate.id === recipe.id);

  if (!fullRecipe) return null;

  const nutrition = fullRecipe.nutrition;

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <article
        aria-labelledby="hwq-recipe-dialog-title"
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

        {recipe.imageUrl ? (
          <div
            aria-label={`Finished ${fullRecipe.name}`}
            className={`${styles.hero} ${styles.remoteHero}`}
            role="img"
            style={{ backgroundImage: `url("${recipe.imageUrl}")` }}
          />
        ) : (
          <div aria-hidden="true" className={styles.heroFallback}>◇</div>
        )}

        <div className={styles.modalContent}>
          <div>
            <p className="eyebrow">HEALTH AND WELLBEING QUEENSLAND · {fullRecipe.style.toUpperCase()} SNACK</p>
            <h2 className={styles.modalTitle} id="hwq-recipe-dialog-title">
              {fullRecipe.name}
            </h2>
            <p className="subtle">{fullRecipe.description}</p>
          </div>

          <div className={styles.summary}>
            <span><strong>{fullRecipe.servings}</strong> servings</span>
            <span><strong>{fullRecipe.servingSizeGrams}</strong> g per serving</span>
            <span><strong>{fullRecipe.vegetableServes}</strong> veg serves</span>
            <span><strong>{fullRecipe.fruitServes}</strong> fruit serves</span>
          </div>

          <section className={styles.recipeSection}>
            <h3>Nutrition per serving</h3>
            <div className={styles.summary}>
              <span><strong>{nutrition.energyKj}</strong> kJ</span>
              {nutrition.fatGrams != null ? <span><strong>{nutrition.fatGrams}</strong> g fat</span> : null}
              <span><strong>{nutrition.saturatedFatGrams}</strong> g saturates</span>
              <span><strong>{nutrition.carbsGrams}</strong> g carbs</span>
              <span><strong>{nutrition.sugarGrams}</strong> g sugars</span>
              <span><strong>{nutrition.fibreGrams}</strong> g fibre</span>
              <span><strong>{nutrition.proteinGrams}</strong> g protein</span>
              {nutrition.sodiumMg != null ? <span><strong>{nutrition.sodiumMg}</strong> mg sodium</span> : null}
            </div>
          </section>

          <section className={styles.recipeSection}>
            <h3>Ingredients</h3>
            <RecipeIngredientAvailability
              availability={availability}
              ingredientLabels={fullRecipe.ingredients}
              shoppingLists={shoppingLists}
            />
          </section>

          <section className={styles.recipeSection}>
            <h3>Method</h3>
            <ol className={styles.instructions}>
              {fullRecipe.instructions.map((instruction, index) => (
                <li key={`${fullRecipe.id}-step-${index}`}>{instruction}</li>
              ))}
            </ol>
          </section>

          {fullRecipe.notes.length ? (
            <section className={styles.recipeSection}>
              <h3>Recipe notes & storage</h3>
              <ul className={styles.ingredients}>
                {fullRecipe.notes.map((note, index) => (
                  <li key={`${fullRecipe.id}-note-${index}`}>
                    <span>{note}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className={styles.recipeSection}>
            <h3>Categories</h3>
            <div className={styles.meta}>
              {fullRecipe.tags.map((tag) => <span key={tag}>{tag}</span>)}
            </div>
          </section>

          <p className={styles.attribution}>
            Source: Health and Wellbeing Queensland · Healthy Snack Guide ·{" "}
            <a href={recipe.sourceUrl} rel="noopener noreferrer" target="_blank">
              Healthy recipes ↗
            </a>
          </p>
        </div>
      </article>
    </div>
  );
}
