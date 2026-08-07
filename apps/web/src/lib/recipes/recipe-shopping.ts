import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  areEquivalentShoppingIngredients,
  mergeShoppingQuantity,
  type IngredientAvailability,
} from "./recipe-pantry";

export async function addRecipeIngredientsToShoppingList(
  shoppingListId: string,
  ingredients: IngredientAvailability[],
) {
  const missing = ingredients.filter((ingredient) => ingredient.status !== "in-pantry");

  return prisma.$transaction(async (transaction) => {
    const list = await transaction.shoppingList.findUnique({
      where: { id: shoppingListId },
      select: { id: true },
    });
    if (!list) throw new Error("This shopping list no longer exists.");

    const items = await transaction.shoppingItem.findMany({
      where: { shoppingListId },
      orderBy: { id: "asc" },
    });
    let added = 0;
    let reused = 0;

    for (const ingredient of missing) {
      const shoppingIngredient = {
        ...ingredient,
        quantity: ingredient.shoppingQuantity ?? ingredient.quantity,
      };
      const existing = items.find((item) => areEquivalentShoppingIngredients(item, shoppingIngredient));
      if (existing) {
        const merged = mergeShoppingQuantity(existing, shoppingIngredient);
        const updated = await transaction.shoppingItem.update({
          where: { id: existing.id },
          data: {
            productId: existing.productId ?? shoppingIngredient.productId,
            quantity: merged.quantity,
            unit: merged.unit,
            checked: false,
            stockedAt: null,
          },
        });
        Object.assign(existing, updated);
        reused += 1;
        continue;
      }

      const created = await transaction.shoppingItem.create({
        data: {
          shoppingListId,
          productId: shoppingIngredient.productId,
          name: shoppingIngredient.name,
          quantity: shoppingIngredient.quantity,
          unit: shoppingIngredient.unit,
        },
      });
      items.push(created);
      added += 1;
    }

    return { added, reused, total: missing.length };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
