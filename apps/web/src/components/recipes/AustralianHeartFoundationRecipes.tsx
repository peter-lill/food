"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import type { PlannerRecipe } from "@/lib/planner/planner.types";
import type { ExternalRecipe } from "@/lib/recipes/external-recipes";
import styles from "./recipes-gallery.module.css";

type Props = {
  importedRecipes: PlannerRecipe[];
  externalRecipes: ExternalRecipe[];
};

export function AustralianHeartFoundationRecipes({ importedRecipes, externalRecipes }: Props) {
  const [openRecipe, setOpenRecipe] = useState<PlannerRecipe | null>(null);
  const importedBySourceKey = useMemo(
    () => new Map(importedRecipes.map((recipe) => [recipe.sourceKey, recipe])),
    [importedRecipes],
  );
  const importedByName = useMemo(
    () => new Map(importedRecipes.map((recipe) => [recipe.name.toLocaleLowerCase("en-AU"), recipe])),
    [importedRecipes],
  );

  if (!externalRecipes.length && !importedRecipes.length) return null;

  const catalogue = externalRecipes.length
    ? externalRecipes
    : importedRecipes.map((recipe) => ({
        id: recipe.sourceKey?.replace(/^heart-foundation:/, "") ?? recipe.id,
        name: recipe.name,
        description: recipe.description ?? "",
        sourceName: "Heart Foundation" as const,
        sourceUrl: recipe.originalSourceUrl ?? "https://www.heartfoundation.org.au/recipes",
        sourceHomeUrl: "https://www.heartfoundation.org.au/",
        imageUrl: recipe.imageUrl,
        minutes: recipe.minutes,
        servings: recipe.servings,
        licence: "National Heart Foundation of Australia.",
        tags: [],
      }));

  return (
    <section className={styles.savedSection}>
      <div className={styles.sectionHeading}>
        <div>
          <p className="eyebrow">AUSTRALIAN HEART FOUNDATION</p>
          <h2>Australian Heart Foundation recipes</h2>
          <p className="subtle">Heart-healthy recipes from the National Heart Foundation of Australia.</p>
        </div>
        <span className="badge neutral">{catalogue.length} recipes</span>
      </div>

      <div className={styles.gallery}>
        {catalogue.map((recipe) => {
          const imported =
            importedBySourceKey.get(`heart-foundation:${recipe.id}`) ??
            importedByName.get(recipe.name.toLocaleLowerCase("en-AU")) ??
            null;
          const imageUrl = imported?.imageUrl ?? recipe.imageUrl;

          return (
            <article className={styles.card} key={recipe.id}>
              {imageUrl ? (
                <div className={styles.cardImage}>
                  <Image alt={`Finished ${recipe.name}`} fill sizes="(max-width: 760px) 126px, 230px" src={imageUrl} />
                </div>
              ) : <div aria-hidden="true" className={styles.imageFallback}>◇</div>}
              <div className={styles.cardContent}>
                <span className={styles.source}>Australian Heart Foundation</span>
                <h2>{recipe.name}</h2>
                {recipe.description ? <p className={styles.description}>{recipe.description}</p> : null}
                <div className={styles.meta}>
                  {(imported?.minutes ?? recipe.minutes) ? <span>{imported?.minutes ?? recipe.minutes} min</span> : null}
                  {(imported?.servings ?? recipe.servings) ? <span>{imported?.servings ?? recipe.servings} servings</span> : null}
                </div>
                <span className={styles.openLabel}>{imported ? "View recipe →" : "View original recipe ↗"}</span>
              </div>
              {imported ? (
                <button aria-label={`Open recipe for ${recipe.name}`} className={styles.cardAction} onClick={() => setOpenRecipe(imported)} type="button" />
              ) : (
                <a aria-label={`View ${recipe.name} on the Australian Heart Foundation website`} className={styles.cardAction} href={recipe.sourceUrl} rel="noopener noreferrer" target="_blank" />
              )}
            </article>
          );
        })}
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
              {openRecipe.originalSourceUrl ? <a href={openRecipe.originalSourceUrl} rel="noopener noreferrer" target="_blank">View original on Australian Heart Foundation ↗</a> : null}
            </div>
          </article>
        </div>
      ) : null}
    </section>
  );
}
