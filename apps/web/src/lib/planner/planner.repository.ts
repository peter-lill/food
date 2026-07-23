import { prisma } from "@/lib/prisma";
import type { PlannerRecipe, PlannerWorkspaceData } from "./planner.types";

const starterRecipes: PlannerRecipe[] = [
  {
    id: "starter-lemon-herb-chicken-bowl",
    name: "Lemon herb chicken bowl",
    description: "Chicken, brown rice and greens with a fresh lemon herb finish.",
    minutes: 28,
    proteinGrams: 58,
    source: "starter",
    ingredients: [
      { name: "Chicken breast", quantity: 1, unit: "kg" },
      { name: "Brown rice", quantity: 2, unit: "cups" },
      { name: "Broccoli", quantity: 2, unit: "heads" },
      { name: "Lemon", quantity: 2, unit: "each" },
    ],
  },
  {
    id: "starter-salmon-rice-greens",
    name: "Salmon, rice and greens",
    description: "A fast salmon dinner with brown rice and green vegetables.",
    minutes: 25,
    proteinGrams: 49,
    source: "starter",
    ingredients: [
      { name: "Salmon", quantity: 2, unit: "fillets" },
      { name: "Brown rice", quantity: 1.5, unit: "cups" },
      { name: "Green beans", quantity: 400, unit: "g" },
      { name: "Lemon", quantity: 1, unit: "each" },
    ],
  },
  {
    id: "starter-lean-beef-burrito-bowl",
    name: "Lean beef burrito bowl",
    description: "Lean beef, rice, beans and vegetables in a simple weeknight bowl.",
    minutes: 30,
    proteinGrams: 54,
    source: "starter",
    ingredients: [
      { name: "Lean beef mince", quantity: 750, unit: "g" },
      { name: "Brown rice", quantity: 2, unit: "cups" },
      { name: "Black beans", quantity: 1, unit: "tin" },
      { name: "Corn", quantity: 1, unit: "tin" },
      { name: "Avocado", quantity: 2, unit: "each" },
    ],
  },
];

export async function getPlannerWorkspace(): Promise<PlannerWorkspaceData> {
  const [recipes, pantryItems, shoppingLists] = await Promise.all([
    prisma.recipe.findMany({
      include: {
        ingredients: {
          include: { ingredient: true },
          orderBy: { ingredient: { name: "asc" } },
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.inventoryItem.findMany({
      where: { quantity: { gt: 0 } },
      include: { product: true },
      orderBy: [{ product: { name: "asc" } }, { expiresAt: "asc" }],
    }),
    prisma.shoppingList.findMany({
      include: { items: { select: { checked: true } } },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  const liveRecipes: PlannerRecipe[] = recipes.map((recipe) => {
    const totalMinutes = (recipe.prepMinutes ?? 0) + (recipe.cookMinutes ?? 0);
    return {
      id: recipe.id,
      name: recipe.name,
      description: recipe.description,
      minutes: totalMinutes > 0 ? totalMinutes : null,
      proteinGrams: recipe.proteinGrams,
      source: "database",
      ingredients: recipe.ingredients.map((entry) => ({
        name: entry.ingredient.name,
        quantity: entry.quantity,
        unit: entry.unit,
      })),
    };
  });

  return {
    recipes: liveRecipes.length > 0 ? liveRecipes : starterRecipes,
    pantryItems: pantryItems.map((item) => ({
      name: item.product.name,
      quantity: item.quantity,
      unit: item.unit,
      location: item.location,
    })),
    shoppingLists: shoppingLists.map((list) => ({
      id: list.id,
      name: list.name,
      remainingCount: list.items.filter((item) => !item.checked).length,
    })),
  };
}