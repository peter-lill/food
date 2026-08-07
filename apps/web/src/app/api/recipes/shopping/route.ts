import { NextRequest, NextResponse } from "next/server";
import type { IngredientAvailability } from "@/lib/recipes/recipe-pantry";
import { addRecipeIngredientsToShoppingList } from "@/lib/recipes/recipe-shopping";

function validIngredient(value: unknown): value is IngredientAvailability {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return typeof item.name === "string"
    && item.name.length > 0
    && item.name.length <= 120
    && (item.quantity === null || (typeof item.quantity === "number" && item.quantity > 0))
    && (item.unit === null || (typeof item.unit === "string" && item.unit.length <= 30))
    && (item.productId === null || typeof item.productId === "string")
    && ["missing", "partial"].includes(String(item.status));
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { shoppingListId?: unknown; ingredients?: unknown };
    if (typeof body.shoppingListId !== "string" || !Array.isArray(body.ingredients)) {
      return NextResponse.json({ error: "A shopping list and ingredients are required." }, { status: 400 });
    }
    if (body.ingredients.length > 100 || !body.ingredients.every(validIngredient)) {
      return NextResponse.json({ error: "The ingredient selection is invalid." }, { status: 400 });
    }

    const result = await addRecipeIngredientsToShoppingList(body.shoppingListId, body.ingredients);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Unable to add recipe ingredients to shopping list", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "The ingredients could not be added." },
      { status: 422 },
    );
  }
}
