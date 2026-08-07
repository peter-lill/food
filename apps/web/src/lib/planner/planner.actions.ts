"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAuthSession } from "@/lib/auth-session";
import { prisma } from "@/lib/prisma";
import { addRecipeIngredientsToShoppingList } from "@/lib/recipes/recipe-shopping";
import { getPlannerWorkspace, isStaticPlannerRecipeId } from "./planner.repository";

const maximumServings = 100;

function validWeekStart(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

async function knownRecipe(recipeId: string) {
  if (isStaticPlannerRecipeId(recipeId)) return true;
  return Boolean(await prisma.recipe.findUnique({ where: { id: recipeId }, select: { id: true } }));
}

export async function savePlannerDay(
  weekStartValue: string,
  day: number,
  recipeId: string,
  servings: number,
) {
  const session = await requireAuthSession();
  const weekStart = validWeekStart(weekStartValue);
  const cleanRecipeId = recipeId.trim();

  if (!weekStart || !Number.isInteger(day) || day < 0 || day > 6) {
    return { ok: false as const, error: "That planner day is invalid." };
  }
  if (cleanRecipeId && (!Number.isInteger(servings) || servings < 1 || servings > maximumServings)) {
    return { ok: false as const, error: "Servings must be between 1 and 100." };
  }
  if (cleanRecipeId && !(await knownRecipe(cleanRecipeId))) {
    return { ok: false as const, error: "That recipe is no longer available." };
  }

  const plan = await prisma.weeklyMealPlan.upsert({
    where: { userId_weekStart: { userId: session.user.id, weekStart } },
    update: {},
    create: { userId: session.user.id, weekStart },
    select: { id: true },
  });

  if (!cleanRecipeId) {
    await prisma.weeklyMealPlanEntry.deleteMany({ where: { mealPlanId: plan.id, day } });
  } else {
    await prisma.weeklyMealPlanEntry.upsert({
      where: { mealPlanId_day: { mealPlanId: plan.id, day } },
      update: { recipeKey: cleanRecipeId, servings },
      create: { mealPlanId: plan.id, day, recipeKey: cleanRecipeId, servings },
    });
  }

  revalidatePath("/planner");
  return { ok: true as const };
}

export async function clearPlannerWeek(weekStartValue: string) {
  const session = await requireAuthSession();
  const weekStart = validWeekStart(weekStartValue);
  if (!weekStart) return { ok: false as const, error: "That planner week is invalid." };

  await prisma.weeklyMealPlan.deleteMany({
    where: { userId: session.user.id, weekStart },
  });
  revalidatePath("/planner");
  return { ok: true as const };
}

export async function addPlannerIngredientsToShopping(formData: FormData) {
  const session = await requireAuthSession();
  const listId = String(formData.get("shoppingListId") ?? "").trim();
  const weekStart = validWeekStart(String(formData.get("weekStart") ?? ""));
  if (!listId || !weekStart) redirect("/planner?shoppingError=1");

  let ingredientCount = 0;
  try {
    const workspace = await getPlannerWorkspace(session.user.id, weekStart);
    ingredientCount = workspace.missingIngredients.length;
    if (ingredientCount > 0) {
      await addRecipeIngredientsToShoppingList(listId, workspace.missingIngredients);
    }
  } catch (error) {
    console.error("Unable to add planned ingredients to Shopping", error);
    redirect("/planner?shoppingError=1");
  }

  revalidatePath("/shopping");
  revalidatePath("/planner");
  revalidatePath("/products");
  if (ingredientCount === 0) redirect("/planner");
  redirect(`/shopping?list=${listId}`);
}
