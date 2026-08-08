"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  addPlannerIngredientsToShopping,
  clearPlannerWeek,
  savePlannerDay,
} from "@/lib/planner/planner.actions";
import { plannerRecipeCardView } from "@/lib/planner/planner-card";
import type {
  PlannerDaySelection,
  PlannerRecipe,
  PlannerWorkspaceData,
} from "@/lib/planner/planner.types";
import { plannerDays as days } from "@/lib/planner/planner-week";
import styles from "./planner-workspace.module.css";

type PlanSelection = Record<string, PlannerDaySelection>;

type PlannerWorkspaceProps = {
  data: PlannerWorkspaceData;
  loadError?: boolean;
  shoppingError?: boolean;
};

function formatIngredientAmount(quantity: number | null, unit: string | null) {
  if (quantity === null) return unit ?? "As needed";
  const rounded = Math.round(quantity * 100) / 100;
  return `${rounded}${unit ? ` ${unit}` : ""}`;
}

export function PlannerWorkspace({ data, loadError = false, shoppingError = false }: PlannerWorkspaceProps) {
  const router = useRouter();
  const [plan, setPlan] = useState<PlanSelection>(data.plan);
  const [openRecipe, setOpenRecipe] = useState<{ recipe: PlannerRecipe; servings: number } | null>(null);
  const [importingDay, setImportingDay] = useState<string | null>(null);
  const [importError, setImportError] = useState("");
  const [saving, startSaving] = useTransition();
  const recipeById = useMemo(
    () => new Map(data.recipes.map((recipe) => [recipe.id, recipe])),
    [data.recipes],
  );
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

  const plannedRecipes = useMemo(
    () => days.map((day) => recipeById.get(plan[day.key]?.recipeId)).filter((recipe): recipe is PlannerRecipe => Boolean(recipe)),
    [plan, recipeById],
  );
  const missingIngredients = data.missingIngredients;

  function persistSelection(dayKey: string, selection: PlannerDaySelection | null) {
    const day = days.findIndex((candidate) => candidate.key === dayKey);
    startSaving(async () => {
      const result = await savePlannerDay(
        data.weekStart,
        day,
        selection?.recipeId ?? "",
        selection?.servings ?? 1,
      );
      if (!result.ok) {
        setImportError(result.error);
        setPlan(data.plan);
      }
      router.refresh();
    });
  }

  async function assignRecipe(dayKey: string, recipeId: string) {
    setImportError("");

    if (!recipeId) {
      setPlan((current) => {
        const next = { ...current };
        delete next[dayKey];
        return next;
      });
      persistSelection(dayKey, null);
      return;
    }

    if (!recipeId.startsWith("external-")) {
      const recipe = recipeById.get(recipeId);
      const selection = { recipeId, servings: recipe?.servings ?? 1 };
      setPlan((current) => ({ ...current, [dayKey]: selection }));
      persistSelection(dayKey, selection);
      return;
    }

    const externalRecipeId = recipeId.slice("external-".length);
    setImportingDay(dayKey);

    try {
      const response = await fetch("/api/recipes/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ externalRecipeId }),
      });
      const result = await response.json() as { recipeId?: string; error?: string };
      if (!response.ok || !result.recipeId) throw new Error(result.error ?? "Unable to import recipe.");

      const importedRecipeId = result.recipeId as string;
      const servings = recipeById.get(recipeId)?.servings ?? 1;
      const selection = { recipeId: importedRecipeId, servings };
      setPlan((current) => ({ ...current, [dayKey]: selection }));
      persistSelection(dayKey, selection);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Unable to import this recipe.");
    } finally {
      setImportingDay(null);
    }
  }

  function changeServings(dayKey: string, servings: number) {
    const current = plan[dayKey];
    if (!current || !Number.isInteger(servings) || servings < 1 || servings > 100) return;
    const selection = { ...current, servings };
    setPlan((planValue) => ({ ...planValue, [dayKey]: selection }));
    persistSelection(dayKey, selection);
  }

  function clearWeek() {
    setPlan({});
    startSaving(async () => {
      const result = await clearPlannerWeek(data.weekStart);
      if (!result.ok) {
        setImportError(result.error);
        setPlan(data.plan);
      }
      router.refresh();
    });
  }

  if (loadError) {
    return (
      <div className="card pantry-error" role="alert">
        <strong>Planner data is unavailable.</strong>
        <p>Check the PostgreSQL connection and refresh this page.</p>
      </div>
    );
  }

  return (
    <div className={styles.workspace}>
      <header className="pantry-page-heading">
        <div>
          <p className="eyebrow">MEAL PLANNING</p>
          <h1 className="page-title">Planner</h1>
          <p className="subtle">Choose meals for the week, check what is already in Pantry and send only missing ingredients to Shopping.</p>
        </div>
        <div className={styles.headerActions}>
          <Link className="secondary-button" href="/recipes">Browse recipes</Link>
          <Link className="primary-button" href="/shopping">Open Shopping</Link>
        </div>
      </header>

      {shoppingError && (
        <div className="card pantry-error" role="alert">
          <strong>Ingredients were not added.</strong>
          <p>Select an available Shopping list and try again.</p>
        </div>
      )}
      {importError ? (
        <div className="card pantry-error" role="alert">
          <strong>Recipe could not be imported.</strong>
          <p>{importError}</p>
        </div>
      ) : null}

      <section className={styles.summaryGrid} aria-label="Planner summary">
        <article className="card">
          <span className={styles.metricLabel}>Days planned</span>
          <strong className={styles.metric}>{plannedRecipes.length}/7</strong>
          <span className="subtle">Saved to your account</span>
        </article>
        <article className="card">
          <span className={styles.metricLabel}>Recipe library</span>
          <strong className={styles.metric}>{data.recipes.length}</strong>
          <span className="subtle">Full recipes available</span>
        </article>
        <article className="card">
          <span className={styles.metricLabel}>Missing ingredients</span>
          <strong className={styles.metric}>{missingIngredients.length}</strong>
          <span className="subtle">Across planned meals</span>
        </article>
      </section>

      <div className={styles.layout}>
        <section className={styles.planPanel}>
          <div className={styles.sectionHeading}>
            <div>
              <p className="eyebrow">THIS WEEK</p>
              <h2>Choose a meal for each day</h2>
            </div>
            {plannedRecipes.length > 0 && (
              <button className="secondary-button" disabled={saving} type="button" onClick={clearWeek}>Clear week</button>
            )}
          </div>

          <div className={styles.dayGrid}>
            {days.map((day) => {
              const selection = plan[day.key];
              const selected = recipeById.get(selection?.recipeId);
              const availability = data.dayAvailability[day.key];
              const recipeCard = selected ? plannerRecipeCardView(selected, availability) : null;
              return (
                <article className={`${styles.dayCard}${selected ? ` ${styles.dayCardPlanned}` : ""}`} key={day.key}>
                  <div className={styles.dayHeading}>
                    <span>{day.short}</span>
                    <strong>{day.label}</strong>
                  </div>
                  <label className={styles.selectLabel}>
                    <span>Recipe</span>
                    <select aria-label={`Recipe for ${day.label}`} value={selection?.recipeId ?? ""} disabled={importingDay === day.key || saving} onChange={(event) => void assignRecipe(day.key, event.target.value)}>
                      <option value="">Choose a recipe</option>
                      {data.recipes.map((recipe) => <option value={recipe.id} key={recipe.id}>{recipe.name}</option>)}
                    </select>
                  </label>
                  {importingDay === day.key ? <p className={styles.emptyDay}>Importing ingredients…</p> : selected && selection && recipeCard ? (
                    <>
                      <div className={styles.recipeDetail}>
                        {recipeCard.imageUrl ? (
                          <div
                            aria-label={`Finished ${selected.name}`}
                            className={styles.plannedRecipeImage}
                            role="img"
                            style={{ backgroundImage: `url("${recipeCard.imageUrl}")` }}
                          />
                        ) : (
                          <div aria-hidden="true" className={styles.plannedRecipeImageFallback}>◇</div>
                        )}
                        <div className={styles.plannedRecipeBody}>
                          <span className={styles.recipeSource}>{recipeCard.sourceLabel}</span>
                          <strong className={styles.plannedRecipeTitle}>{selected.name}</strong>
                          {selected.description && <p>{selected.description}</p>}
                          <div className={styles.recipeMeta}>
                            {selected.minutes && <span>{selected.minutes} min</span>}
                            <span>{recipeCard.ingredientLabel}</span>
                            {recipeCard.pantryPercent !== null && <span>{recipeCard.pantryPercent}% in Pantry</span>}
                          </div>
                          <span className={styles.openRecipeLabel}>View full recipe →</span>
                        </div>
                        <button
                          aria-label={`Open recipe for ${selected.name}`}
                          className={styles.recipeCardAction}
                          onClick={() => setOpenRecipe({ recipe: selected, servings: selection.servings })}
                          type="button"
                        />
                      </div>
                      <div className={styles.plannedRecipeControls}>
                        <label className={styles.servingsField}>
                          <span>Servings</span>
                          <input
                            aria-label={`Servings for ${day.label}`}
                            min="1"
                            max="100"
                            onChange={(event) => changeServings(day.key, Number(event.target.value))}
                            type="number"
                            value={selection.servings}
                          />
                        </label>
                        <span className={styles.pantryStatus}>
                          {recipeCard.pantryPercent !== null ? (
                            <><strong>{recipeCard.pantryPercent}%</strong>matched in Pantry</>
                          ) : (
                            <><strong>—</strong>Pantry check pending</>
                          )}
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className={styles.emptyRecipeCard}>
                      <span aria-hidden="true">+</span>
                      <strong>No meal selected</strong>
                      <small>Choose from {data.recipes.length} complete recipe cards.</small>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>

        <aside className={styles.sidebar}>
          <section className="card">
            <div className={styles.sectionHeading}>
              <div>
                <p className="eyebrow">PANTRY CHECK</p>
                <h2>What you still need</h2>
              </div>
              <span className="badge neutral">{data.pantryItems.length} stocked</span>
            </div>

            {plannedRecipes.length === 0 ? (
              <p className="subtle">Choose at least one meal to calculate missing ingredients.</p>
            ) : missingIngredients.length === 0 ? (
              <div className={styles.readyState}><strong>You are ready to cook.</strong><span>Every listed ingredient matches something in Pantry.</span></div>
            ) : (
              <div className={styles.ingredientList}>
                {missingIngredients.map((ingredient) => (
                  <div key={`${ingredient.productId ?? ingredient.name}-${ingredient.unit}`}>
                    <span>
                      {ingredient.name}
                      {ingredient.status === "partial" ? <small>Partially available</small> : <small>Missing</small>}
                    </span>
                    <strong>{formatIngredientAmount(ingredient.shoppingQuantity ?? ingredient.quantity, ingredient.unit)}</strong>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="card">
            <p className="eyebrow">SHOPPING HANDOFF</p>
            <h2>Add missing ingredients</h2>
            <p className="subtle">This adds or reopens items in the selected persisted Shopping list.</p>
            {data.shoppingLists.length === 0 ? (
              <Link className="primary-button full-width" href="/shopping">Create a Shopping list</Link>
            ) : (
              <form action={addPlannerIngredientsToShopping} className={styles.shoppingForm}>
                <input type="hidden" name="weekStart" value={data.weekStart} />
                <label>
                  <span>Shopping list</span>
                  <select name="shoppingListId" defaultValue={data.shoppingLists[0]?.id} required>
                    {data.shoppingLists.map((list) => (
                      <option value={list.id} key={list.id}>{list.name} · {list.remainingCount} remaining</option>
                    ))}
                  </select>
                </label>
                <button className="primary-button full-width" type="submit" disabled={missingIngredients.length === 0}>
                  Add {missingIngredients.length || "no"} missing item{missingIngredients.length === 1 ? "" : "s"}
                </button>
              </form>
            )}
          </section>
        </aside>
      </div>

      {openRecipe ? (
        <div className={styles.recipeBackdrop} onClick={() => setOpenRecipe(null)}>
          <article
            aria-labelledby="planner-recipe-title"
            aria-modal="true"
            className={styles.recipeModal}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <button
              aria-label="Close recipe"
              className={styles.closeRecipe}
              onClick={() => setOpenRecipe(null)}
              type="button"
            >
              ×
            </button>
            {openRecipe.recipe.imageUrl ? (
              <div className={styles.recipeImage}>
                <Image
                  alt={`Finished ${openRecipe.recipe.name}`}
                  fill
                  priority
                  sizes="(max-width: 760px) 100vw, 760px"
                  src={openRecipe.recipe.imageUrl}
                />
              </div>
            ) : (
              <div className={styles.recipeImageFallback} aria-hidden="true">◇</div>
            )}
            <div className={styles.recipeContent}>
              <div>
                <p className="eyebrow">RECIPE</p>
                <h2 id="planner-recipe-title">{openRecipe.recipe.name}</h2>
                {openRecipe.recipe.description ? <p className={styles.recipeDescription}>{openRecipe.recipe.description}</p> : null}
              </div>
              <div className={styles.recipeSummary}>
                {openRecipe.recipe.minutes ? <span><strong>{openRecipe.recipe.minutes}</strong> minutes</span> : null}
                <span><strong>{openRecipe.servings}</strong> planned servings</span>
                {openRecipe.recipe.proteinGrams ? <span><strong>{Math.round(openRecipe.recipe.proteinGrams)} g</strong> protein</span> : null}
              </div>
              <div className={styles.recipeColumns}>
                <section>
                  <h3>Ingredients</h3>
                  <ul className={styles.recipeIngredients}>
                    {openRecipe.recipe.ingredients.map((ingredient) => (
                      <li key={`${ingredient.name}-${ingredient.unit}`}>
                        <span>{ingredient.name}</span>
                        <strong>{formatIngredientAmount(
                          ingredient.quantity === null
                            ? null
                            : ingredient.quantity * openRecipe.servings / Math.max(openRecipe.recipe.servings, 1),
                          ingredient.unit,
                        )}</strong>
                      </li>
                    ))}
                  </ul>
                </section>
                <section>
                  <h3>Method</h3>
                  {openRecipe.recipe.instructions.length > 0 ? (
                    <ol className={styles.recipeMethod}>
                      {openRecipe.recipe.instructions.map((instruction, index) => (
                        <li key={`${index}-${instruction}`}>{instruction}</li>
                      ))}
                    </ol>
                  ) : (
                    <p className={styles.recipeDescription}>No cooking method has been saved for this recipe yet.</p>
                  )}
                </section>
              </div>
            </div>
          </article>
        </div>
      ) : null}
    </div>
  );
}
