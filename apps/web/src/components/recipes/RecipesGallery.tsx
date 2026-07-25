"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import type { PlannerRecipe } from "@/lib/planner/planner.types";
import styles from "./recipes-gallery.module.css";

type RecipesGalleryProps = {
  recipes: PlannerRecipe[];
};

export function RecipesGallery({ recipes }: RecipesGalleryProps) {
  const [openRecipe, setOpenRecipe] = useState<PlannerRecipe | null>(null);

  useEffect(() => {
    if (!openRecipe) return;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenRecipe(null);
    }

    document.addEventListener("keydown", closeOnEscape);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = "";
    };
  }, [openRecipe]);

  return (
    <>
      <div className={styles.gallery}>
        {recipes.length === 0 ? (
          <div className={`card ${styles.empty}`}>
            <strong>No recipes yet.</strong>
            <p className="subtle">Add a recipe to start building your collection.</p>
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
                {openRecipe.proteinGrams ? (
                  <span><strong>{Math.round(openRecipe.proteinGrams)} g</strong> protein</span>
                ) : null}
              </div>

              <div className={styles.columns}>
                <section>
                  <h3>Ingredients</h3>
                  {openRecipe.ingredients.length > 0 ? (
                    <ul className={styles.ingredients}>
                      {openRecipe.ingredients.map((ingredient) => (
                        <li key={`${ingredient.name}-${ingredient.unit}`}>
                          <span>{ingredient.name}</span>
                          <strong>{ingredient.quantity} {ingredient.unit}</strong>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="subtle">No ingredients have been saved yet.</p>
                  )}
                </section>

                <section>
                  <h3>Method</h3>
                  {openRecipe.instructions.length > 0 ? (
                    <ol className={styles.method}>
                      {openRecipe.instructions.map((instruction, index) => (
                        <li key={`${index}-${instruction}`}>{instruction}</li>
                      ))}
                    </ol>
                  ) : (
                    <p className="subtle">No cooking method has been saved yet.</p>
                  )}
                </section>
              </div>
            </div>
          </article>
        </div>
      ) : null}
    </>
  );
}
