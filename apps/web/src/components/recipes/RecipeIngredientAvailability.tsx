"use client";

import { useMemo, useState } from "react";
import type { IngredientAvailability } from "@/lib/recipes/recipe-pantry";
import styles from "./recipes-gallery.module.css";

type ShoppingListOption = { id: string; name: string };

type Props = {
  availability: IngredientAvailability[];
  ingredientLabels: string[];
  shoppingLists: ShoppingListOption[];
};

const statusLabel = {
  "in-pantry": "In pantry",
  partial: "Partially available",
  missing: "Missing",
} as const;

export function RecipeIngredientAvailability({ availability, ingredientLabels, shoppingLists }: Props) {
  const missing = useMemo(
    () => availability.filter((ingredient) => ingredient.status !== "in-pantry"),
    [availability],
  );
  const [listId, setListId] = useState(shoppingLists[0]?.id ?? "");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function addMissing() {
    if (!listId || !missing.length || pending) return;
    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/api/recipes/shopping", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ shoppingListId: listId, ingredients: missing }),
      });
      const result = await response.json() as { added?: number; reused?: number; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to update the shopping list.");
      setMessage(`${result.added ?? 0} added, ${result.reused ?? 0} existing item${result.reused === 1 ? "" : "s"} updated.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update the shopping list.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <ul className={styles.ingredients}>
        {ingredientLabels.map((label, index) => {
          const item = availability[index];
          return (
            <li key={`${label}-${index}`}>
              <span>{label}</span>
              {item ? <span className={`${styles.availability} ${styles[item.status]}`}>{statusLabel[item.status]}</span> : null}
            </li>
          );
        })}
      </ul>
      {missing.length ? (
        <div className={styles.shoppingAction}>
          {shoppingLists.length ? (
            <>
              <label>
                <span>Shopping list</span>
                <select onChange={(event) => setListId(event.target.value)} value={listId}>
                  {shoppingLists.map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}
                </select>
              </label>
              <button disabled={pending} onClick={addMissing} type="button">
                {pending ? "Adding…" : `Add ${missing.length} missing ingredient${missing.length === 1 ? "" : "s"}`}
              </button>
            </>
          ) : <a href="/shopping">Create a shopping list to add missing ingredients</a>}
          {message ? <p aria-live="polite">{message}</p> : null}
        </div>
      ) : <p className={styles.allAvailable}>Everything is in your pantry.</p>}
    </>
  );
}
