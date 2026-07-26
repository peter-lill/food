"use client";

import Image from "next/image";
import { useState } from "react";
import type { PlannerRecipe } from "@/lib/planner/planner.types";
import styles from "./recipes-gallery.module.css";

export function AustralianHeartFoundationRecipes({ recipes }: { recipes: PlannerRecipe[] }) {
  const [openRecipe, setOpenRecipe] = useState<PlannerRecipe | null>(null);

  if (!recipes.length) return null;

  return (
    <section className={styles.savedSection}>
      <div className={styles.sectionHeading}>
        <div>
          <p className="eyebrow">AUSTRALIAN HEART FOUNDATION</p>
          <h2>Australian Heart Foundation recipes</h2>
          <p className="subtle">Imported Australian recipes remain attributed to their original publisher.</p>
        </div>
        <span className="badge neutral">{recipes.length} recipes</span>
      </div>

      <div className={styles.gallery}>
        {recipes.map((recipe) => (
          <article className={styles.card} key={recipe.id}>
            {recipe.imageUrl ? (
              <div className={styles.cardImage}>
                <Image alt={`Finished ${recipe.name}`} fill sizes="(max-width: 760px) 126px, 230px" src={recipe.imageUrl} />
              </div>
            ) : <div aria-hidden="true" className={styles.imageFallback}>◇</div>}
            <div className={styles.cardContent}>
              <span className={styles.source}>Australian Heart Foundation</span>
              <h2>{recipe.name}</h2>
              {recipe.description ? <p className={styles.description}>{recipe.description}</p> : null}
              <div className={styles.meta}>
                {recipe.minutes ? <span>{recipe.minutes} min</span> : null}
                <span>{recipe.servings} serving{recipe.servings === 1 ? "" : "s"}</span>
              </div>
              <span className={styles.openLabel}>View recipe →</span>
            </div>
            <button aria-label={`Open recipe for ${recipe.name}`} className={styles.cardAction} onClick={() => setOpenRecipe(recipe)} type="button" />
          </article>
        ))}
      </div>

      {openRecipe ? (
        <div className={styles.backdrop} onClick={() => setOpenRecipe(null)}>
          <article aria-labelledby="australian-heart-recipe-title" aria-modal="true" className={styles.modal} onClick={(event) => event.stopPropagation()} role="dialog">
            <button aria-label="Close recipe" className={styles.close} onClick={() => setOpenRecipe(null)} type="button">×</button>
            {openRecipe.imageUrl ? (
              <div className={styles.hero}>
                <Image alt={`Finished ${openRecipe.name}`} fill sizes="(max-width: 760px) 100vw, 760px" src={openRecipe.imageUrl} />
              </div>
            ) : null}
            <div className={styles.modalContent}>
              <div>
                <p className="eyebrow">AUSTRALIAN HEART FOUNDATION</p>
                <h2 className={styles.modalTitle} id="australian-heart-recipe-title">{openRecipe.name}</h2>
                {openRecipe.description ? <p className="subtle">{openRecipe.description}</p> : null}
              </div>
              <div className={styles.columns}>
                <section>
                  <h3>Ingredients</h3>
                  <ul className={styles.ingredients}>
                    {openRecipe.ingredients.map((ingredient, index) => (
                      <li key={`${ingredient.name}-${index}`}><strong>{ingredient.quantity} {ingredient.unit}</strong><span>{ingredient.name}</span></li>
                    ))}
                  </ul>
                </section>
                <section>
                  <h3>Method</h3>
                  <ol className={styles.method}>
                    {openRecipe.instructions.map((instruction, index) => <li key={`${index}-${instruction.slice(0, 24)}`}>{instruction}</li>)}
                  </ol>
                </section>
              </div>
              {openRecipe.originalSourceUrl ? <a href={openRecipe.originalSourceUrl}>View original source</a> : null}
            </div>
          </article>
        </div>
      ) : null}
    </section>
  );
}
