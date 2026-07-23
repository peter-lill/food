"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

const maximumQuantity = 100_000;

type PlannedIngredient = {
  name: string;
  quantity: number;
  unit: string;
};

function parseIngredient(value: FormDataEntryValue): PlannedIngredient | null {
  try {
    const parsed = JSON.parse(String(value)) as Partial<PlannedIngredient>;
    const name = String(parsed.name ?? "").trim();
    const unit = String(parsed.unit ?? "").trim();
    const quantity = Number(parsed.quantity);

    if (name.length < 2 || name.length > 100) return null;
    if (!unit || unit.length > 30) return null;
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > maximumQuantity) return null;

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
    const key = `${ingredient.name.toLocaleLowerCase("en-AU")}|${ingredient.unit.toLocaleLowerCase("en-AU")}`;
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

      for (const ingredient of grouped.values()) {
        const existing = await transaction.shoppingItem.findFirst({
          where: {
            shoppingListId: listId,
            name: { equals: ingredient.name, mode: "insensitive" },
          },
        });

        if (existing) {
          await transaction.shoppingItem.update({
            where: { id: existing.id },
            data: {
              checked: false,
              quantity: Math.max(existing.quantity ?? 0, ingredient.quantity),
              unit: existing.unit ?? ingredient.unit,
            },
          });
        } else {
          await transaction.shoppingItem.create({
            data: {
              shoppingListId: listId,
              name: ingredient.name,
              quantity: ingredient.quantity,
              unit: ingredient.unit,
            },
          });
        }
      }
    });
  } catch (error) {
    console.error("Unable to add planned ingredients to Shopping", error);
    redirect("/planner?shoppingError=1");
  }

  revalidatePath("/shopping");
  revalidatePath("/planner");
  redirect(`/shopping?list=${listId}`);
}