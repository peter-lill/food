"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { addPlannerIngredientsToShopping } from "@/lib/planner/planner.actions";
import type {
  PlannerIngredient,
  PlannerRecipe,
  PlannerWorkspaceData,
} from "@/lib/planner/planner.types";
import styles from "./planner-workspace.module.css";

const storageKey = "food-weekly-planner-v2";
const days = [
  { key: "monday", label: "Monday", short: "Mon" },
  { key: "tuesday", label: "Tuesday", short: "Tue" },
  { key: "wednesday", label: "Wednesday", short: "Wed" },
  { key: "thursday", label: "Thursday", short: "Thu" },
  { key: "friday", label: "Friday", short: "Fri" },
  { key: "saturday", label: "Saturday", short: "Sat" },
  { key: "sunday", label: "Sunday", short: "Sun" },
] as const;

type PlanSelection = Record<string, string>;

type PlannerWorkspaceProps = {
  data: PlannerWorkspaceData;
  loadError?: boolean;
  shoppingError?: boolean;
};

function normaliseName(value: string) {
  return value.toLocaleLowerCase("en-AU").replace(/[^a-z0-9]+/g, " ").trim();
}

function readSavedPlan(): PlanSelection {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) ?? "{}") as unknown;
    return parsed && typeof parsed === "object" ? (parsed as PlanSelection) : {};
  } catch {
    return {};
  }
}

function recipeAvailability(recipe: PlannerRecipe, pantryNames: string[]) {
  if (recipe.ingredients.length === 0) return null;
  const available = recipe.ingredients.filter((ingredient) => {
    const ingredientName = normaliseName(ingredient.name);
    return pantryNames.some(
      (pantryName) => pantryName.includes(ingredientName) || ingredientName.includes(pantryName),
    );
  }).length;
  return Math.round((available / recipe.ingredients.length) * 100);
}

function aggregateIngredients(recipes: PlannerRecipe[]) {
  const grouped = new Map<string, PlannerIngredient>();

  for (const recipe of recipes) {
    for (const ingredient of recipe.ingredients) {
      const key = `${normaliseName(ingredient.name)}|${ingredient.unit.toLocaleLowerCase("en-AU")}`;
      const current = grouped.get(key);
      grouped.set(key, {
        ...ingredient,
        quantity: (current?.quantity ?? 0) + ingredient.quantity,
      });
    }
  }

  return [...grouped.values()].sort((left, right) => left.name.localeCompare(right.name));
}

export function PlannerWorkspace({ data, loadError = false, shoppingError = false }: PlannerWorkspaceProps) {
  const [plan, setPlan] = useState<PlanSelection>(readSavedPlan);
  const recipeById = useMemo(
    () => new Map(data.recipes.map((recipe) => [recipe.id, recipe])),
    [data.recipes],
  );
  const pantryNames = useMemo(
    () => data.pantryItems.map((item) => normaliseName(item.name)),
    [data.pantryItems],
  );

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(plan));
  }, [plan]);

  const plannedRecipes = useMemo(
    () => days.map((day) => recipeById.get(plan[day.key])).filter((recipe): recipe is PlannerRecipe => Boolean(recipe)),
    [plan, recipeById],
  );
  const ingredients = useMemo(() => aggregateIngredients(plannedRecipes), [plannedRecipes]);
  const missingIngredients = useMemo(
    () => ingredients.filter((ingredient) => {
      const ingredientName = normaliseName(ingredient.name);
      return !pantryNames.some(
        (pantryName) => pantryName.includes(ingredientName) || ingredientName.includes(pantryName),
      );
    }),
    [ingredients, pantryNames],
  );
  const databaseRecipeCount = data.recipes.filter((recipe) => recipe.source === "database").length;

  function assignRecipe(dayKey: string, recipeId: string) {
    setPlan((current) => {
      if (!recipeId) {
        const next = { ...current };
        delete next[dayKey];
        return next;
      }
      return { ...current, [dayKey]: recipeId };
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

      <section className={styles.summaryGrid} aria-label="Planner summary">
        <article className="card">
          <span className={styles.metricLabel}>Days planned</span>
          <strong className={styles.metric}>{plannedRecipes.length}/7</strong>
          <span className="subtle">Saved on this device</span>
        </article>
        <article className="card">
          <span className={styles.metricLabel}>Recipe source</span>
          <strong className={styles.metric}>{databaseRecipeCount || data.recipes.length}</strong>
          <span className="subtle">{databaseRecipeCount ? "Recipes in PostgreSQL" : "Starter recipes available"}</span>
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
              <button className="secondary-button" type="button" onClick={() => setPlan({})}>Clear week</button>
            )}
          </div>

          <div className={styles.dayGrid}>
            {days.map((day) => {
              const selected = recipeById.get(plan[day.key]);
              const availability = selected ? recipeAvailability(selected, pantryNames) : null;
              return (
                <article className={styles.dayCard} key={day.key}>
                  <div className={styles.dayHeading}>
                    <span>{day.short}</span>
                    <strong>{day.label}</strong>
                  </div>
                  <label className={styles.selectLabel}>
                    <span>Meal</span>
                    <select value={plan[day.key] ?? ""} onChange={(event) => assignRecipe(day.key, event.target.value)}>
                      <option value="">Choose a recipe</option>
                      {data.recipes.map((recipe) => <option value={recipe.id} key={recipe.id}>{recipe.name}</option>)}
                    </select>
                  </label>
                  {selected ? (
                    <div className={styles.recipeDetail}>
                      <strong>{selected.name}</strong>
                      {selected.description && <p>{selected.description}</p>}
                      <div className={styles.recipeMeta}>
                        {selected.minutes && <span>{selected.minutes} min</span>}
                        {selected.proteinGrams && <span>{Math.round(selected.proteinGrams)} g protein</span>}
                        {availability !== null && <span>{availability}% in Pantry</span>}
                      </div>
                    </div>
                  ) : (
                    <p className={styles.emptyDay}>No meal selected.</p>
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
                  <div key={`${ingredient.name}-${ingredient.unit}`}>
                    <span>{ingredient.name}</span>
                    <strong>{ingredient.quantity} {ingredient.unit}</strong>
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
                <label>
                  <span>Shopping list</span>
                  <select name="shoppingListId" defaultValue={data.shoppingLists[0]?.id} required>
                    {data.shoppingLists.map((list) => (
                      <option value={list.id} key={list.id}>{list.name} · {list.remainingCount} remaining</option>
                    ))}
                  </select>
                </label>
                {missingIngredients.map((ingredient) => (
                  <input type="hidden" name="ingredient" value={JSON.stringify(ingredient)} key={`${ingredient.name}-${ingredient.unit}`} />
                ))}
                <button className="primary-button full-width" type="submit" disabled={missingIngredients.length === 0}>
                  Add {missingIngredients.length || "no"} missing item{missingIngredients.length === 1 ? "" : "s"}
                </button>
              </form>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}