"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  canonicalGroceryIdentity,
  canonicalGroceryName,
  resolveCanonicalProduct,
} from "@/lib/products/canonical-grocery.service";
import { normaliseGroceryUnit } from "@/lib/products/food-item-intelligence";

const maximumQuantity = 100_000;

type PlannedIngredient = {
  name: string;
  quantity: number;
  unit: string;
};

function parseIngredient(value: FormDataEntryValue): PlannedIngredient | null {
  try {
    const parsed = JSON.parse(String(value)) as Partial<PlannedIngredient>;
    const rawName = String(parsed.name ?? "").trim();
    const rawUnit = String(parsed.unit ?? "").trim();
    const quantity = Number(parsed.quantity);

    if (rawName.length < 2 || rawName.length > 100) return null;
    if (!rawUnit || rawUnit.length > 30) return null;
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > maximumQuantity) return null;

    const name = canonicalGroceryName(rawName);
    const unit = normaliseGroceryUnit(rawUnit);

    if (name.length < 2 || name.length > 100) return null;
    if (!unit || unit.length > 30) return null;

    return { name, quantity, unit };
  } catch {
    return null;
  }
}

export async function addPlannerIngredientsToShopping(formData: FormData) {
  const listId = String(formData.get("shoppingListId") ?? "").trim();
  const parsedIngredients = formData
    .getAll("ingredient")
    .map(parseIngredient)
    .filter((ingredient): ingredient is PlannedIngredient => ingredient !== null);

  if (!listId || parsedIngredients.length === 0) {
    redirect("/planner?shoppingError=1");
  }

  const grouped = new Map<string, PlannedIngredient>();
  for (const ingredient of parsedIngredients) {
    const key = `${canonicalGroceryIdentity(ingredient.name)}|${normaliseGroceryUnit(ingredient.unit)}`;
    const existing = grouped.get(key);
    grouped.set(key, {
      ...ingredient,
      quantity: (existing?.quantity ?? 0) + ingredient.quantity,
    });
  }

  try {
    await prisma.$transaction(async (transaction) => {
      const list = await transaction.shoppingList.findUnique({
        where: { id: listId },
        select: { id: true },
      });

      if (!list) throw new Error("Shopping list not found");

      const currentItems = await transaction.shoppingItem.findMany({
        where: { shoppingListId: listId },
      });

      for (const ingredient of grouped.values()) {
        const ingredientIdentity = canonicalGroceryIdentity(ingredient.name);
        const ingredientUnit = normaliseGroceryUnit(ingredient.unit);
        const canonicalProduct = await resolveCanonicalProduct(ingredient.name, transaction);
        const existing = currentItems.find((item) => (
          canonicalGroceryIdentity(item.name) === ingredientIdentity
          && normaliseGroceryUnit(item.unit) === ingredientUnit
        ));

        if (existing) {
          const updated = await transaction.shoppingItem.update({
            where: { id: existing.id },
            data: {
              name: canonicalProduct.canonicalName ?? canonicalProduct.name,
              productId: canonicalProduct.id,
              checked: false,
              quantity: Math.max(existing.quantity ?? 0, ingredient.quantity),
              unit: ingredientUnit,
            },
          });
          Object.assign(existing, updated);
        } else {
          const created = await transaction.shoppingItem.create({
            data: {
              shoppingListId: listId,
              productId: canonicalProduct.id,
              name: canonicalProduct.canonicalName ?? canonicalProduct.name,
              quantity: ingredient.quantity,
              unit: ingredientUnit,
            },
          });
          currentItems.push(created);
        }
      }
    });
  } catch (error) {
    console.error("Unable to add planned ingredients to Shopping", error);
    redirect("/planner?shoppingError=1");
  }

  revalidatePath("/shopping");
  revalidatePath("/planner");
  revalidatePath("/products");
  redirect(`/shopping?list=${listId}`);
}
