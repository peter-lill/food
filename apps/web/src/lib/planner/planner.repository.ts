import { prisma } from "@/lib/prisma";
import bhfCatalogue from "@/generated/bhf-recipes.json";
import { externalRecipes } from "@/lib/recipes/external-recipes";
import { hwqSnackRecipes } from "@/lib/recipes/hwq-snacks";
import { parseRecipeIngredientLine } from "@/lib/recipes/recipe-pantry";
import { getRecipeProductCatalogue } from "@/lib/recipes/recipe-pantry.repository";
import { withSourceImage } from "@/lib/recipes/recipe-image";
import { getRecipeMealType } from "@/lib/recipes/recipe-meal-types";
import {
  sanitiseIngredientName,
  sanitiseInstruction,
  sanitiseRecipeText,
} from "@/lib/recipes/recipe-text-sanitizer";
import type { PlannerDayPlan, PlannerRecipe, PlannerWorkspaceData } from "./planner.types";
import { calculatePlannerAvailability } from "./planner-calculations";
import { isPlannerMealSlot, plannerMealSlots } from "./planner-meals";
import { currentPlannerWeekStart, plannerDays } from "./planner-week";

const recipeImages: Record<string, string | null> = {
  "Lemon herb chicken bowl": "/recipes/lemon-herb-chicken-bowl.webp",
  "Salmon, rice and greens": "/recipes/salmon-rice-greens.webp",
  "Lean beef burrito bowl": "/recipes/lean-beef-burrito-bowl.webp",
  "Spinach and Cheese Cob Loaf": "/recipes/spinach-cheese-cob-loaf.webp",
  "Creamy Chicken and Corn Cob Loaf": "/recipes/creamy-chicken-corn-cob-loaf.webp",
  "Roasted Capsicum and Feta Cob Loaf": "/recipes/roasted-capsicum-feta-cob-loaf.webp",
  "Mushroom and Thyme Cob Loaf": "/recipes/mushroom-thyme-cob-loaf.webp",
  "Sweet Chilli Prawn Cob Loaf": "/recipes/sweet-chilli-prawn-cob-loaf.webp",
};

const externalRecipesWithImages = externalRecipes.map(withSourceImage);
const externalRecipeByName = new Map(externalRecipesWithImages.map((recipe) => [recipe.name, recipe]));

const starterRecipes: PlannerRecipe[] = [
  {
    id: "starter-lemon-herb-chicken-bowl",
    name: "Lemon herb chicken bowl",
    description: "Chicken, brown rice and greens with a fresh lemon herb finish.",
    minutes: 28,
    proteinGrams: 58,
    servings: 4,
    imageUrl: recipeImages["Lemon herb chicken bowl"],
    mealType: "Lunch & dinner",
    source: "starter",
    instructions: [
      "Cook the brown rice according to the packet directions, then keep warm.",
      "Season the chicken with salt, pepper and dried herbs. Cook in a lightly oiled frying pan over medium-high heat until golden and cooked through.",
      "Steam the broccoli until bright green and tender-crisp.",
      "Slice the chicken and divide it between bowls with the rice, broccoli and greens.",
      "Finish with fresh herbs and a generous squeeze of lemon.",
    ],
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
    servings: 2,
    imageUrl: recipeImages["Salmon, rice and greens"],
    mealType: "Lunch & dinner",
    source: "starter",
    instructions: [
      "Cook or reheat the brown rice and divide it between two plates.",
      "Pat the salmon dry and season with salt and pepper.",
      "Cook the salmon in a lightly oiled frying pan over medium-high heat for 3–4 minutes on each side, or until cooked to your liking.",
      "Steam the green beans and greens until just tender.",
      "Serve the salmon with the rice and vegetables, finished with lemon.",
    ],
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
    servings: 4,
    imageUrl: recipeImages["Lean beef burrito bowl"],
    mealType: "Lunch & dinner",
    source: "starter",
    instructions: [
      "Cook the brown rice according to the packet directions.",
      "Brown the beef mince in a large frying pan over medium-high heat, breaking it up as it cooks. Season to taste.",
      "Drain and rinse the black beans and corn, then warm them through.",
      "Divide the rice, beef, beans and corn between bowls.",
      "Top with sliced avocado and add tomato, lime or coriander if available.",
    ],
    ingredients: [
      { name: "Lean beef mince", quantity: 750, unit: "g" },
      { name: "Brown rice", quantity: 2, unit: "cups" },
      { name: "Black beans", quantity: 1, unit: "tin" },
      { name: "Corn", quantity: 1, unit: "tin" },
      { name: "Avocado", quantity: 2, unit: "each" },
    ],
  },
];

export const fullCatalogueRecipes: PlannerRecipe[] = [
  ...hwqSnackRecipes.map((recipe) => ({
    id: recipe.id,
    name: recipe.name,
    description: recipe.description,
    minutes: null,
    proteinGrams: recipe.nutrition.proteinGrams,
    servings: recipe.servings,
    imageUrl: recipe.imageUrl,
    mealType: getRecipeMealType(recipe),
    instructions: recipe.instructions,
    ingredients: recipe.ingredients.map(parseRecipeIngredientLine).filter((ingredient) => ingredient.name.length > 0),
    source: "catalogue" as const,
    originalSourceName: "Health and Wellbeing Queensland",
    originalSourceUrl: recipe.sourceUrl,
  })),
  ...bhfCatalogue.recipes.map((recipe) => ({
    id: recipe.id,
    name: recipe.name,
    description: recipe.description,
    minutes: recipe.minutes,
    proteinGrams: null,
    servings: recipe.servings,
    imageUrl: recipe.imageUrl,
    mealType: getRecipeMealType(recipe),
    instructions: recipe.instructions,
    ingredients: recipe.ingredients.map(parseRecipeIngredientLine).filter((ingredient) => ingredient.name.length > 0),
    source: "catalogue" as const,
    originalSourceName: "British Heart Foundation",
    originalSourceUrl: recipe.sourceUrl,
  })),
];

const staticPlannerRecipeIds = new Set([
  ...starterRecipes.map((recipe) => recipe.id),
  ...fullCatalogueRecipes.map((recipe) => recipe.id),
  ...externalRecipesWithImages
    .filter((recipe) => recipe.sourceName === "Heart Foundation")
    .map((recipe) => `external-${recipe.id}`),
]);

export function isStaticPlannerRecipeId(recipeId: string) {
  return staticPlannerRecipeIds.has(recipeId);
}

export async function getPlannerWorkspace(
  userId?: string,
  requestedWeekStart = currentPlannerWeekStart(),
): Promise<PlannerWorkspaceData> {
  const weekStart = new Date(requestedWeekStart);
  weekStart.setUTCHours(0, 0, 0, 0);
  const [recipes, pantryItems, shoppingLists, savedPlan] = await Promise.all([
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
    userId
      ? prisma.weeklyMealPlan.findUnique({
        where: { userId_weekStart: { userId, weekStart } },
        include: { entries: true },
      })
      : Promise.resolve(null),
  ]);

  const importedNames = new Set(recipes.map((recipe) => recipe.name));

  const liveRecipes: PlannerRecipe[] = recipes.map((recipe) => {
    const totalMinutes = (recipe.prepMinutes ?? 0) + (recipe.cookMinutes ?? 0);
    const externalRecipe = externalRecipeByName.get(recipe.name);

    return {
      id: recipe.id,
      name: sanitiseRecipeText(recipe.name),
      description: sanitiseRecipeText(recipe.description),
      minutes: totalMinutes > 0 ? totalMinutes : null,
      proteinGrams: recipe.proteinGrams,
      servings: recipe.servings,
      imageUrl:
        recipeImages[recipe.name] ??
        (externalRecipe?.sourceName === "Heart Foundation"
          ? `/api/recipes/local-image/${externalRecipe.id}`
          : externalRecipe?.imageUrl ?? null),
      mealType: getRecipeMealType(externalRecipe ?? { tags: [] }),
      instructions: recipe.instructions
        ? recipe.instructions
          .split(/\r?\n/)
          .map(sanitiseInstruction)
          .filter(Boolean)
        : [],
      source: "database",
      sourceKey: recipe.sourceKey,
      originalSourceName: externalRecipe?.sourceName ?? null,
      originalSourceUrl: externalRecipe?.sourceUrl ?? null,
      ingredients: recipe.ingredients
        .map((entry) => ({
          name: sanitiseIngredientName(entry.ingredient.name),
          quantity: entry.quantity,
          unit: entry.unit,
          productId: entry.ingredient.productId,
        }))
        .filter((entry) => entry.name.length > 0),
    };
  });

  const completeRecipes = [
    ...starterRecipes.filter((recipe) => !importedNames.has(recipe.name)),
    ...liveRecipes,
    ...(userId ? fullCatalogueRecipes.filter((recipe) => !importedNames.has(recipe.name)) : []),
  ];
  const catalogueRecipes: PlannerRecipe[] = externalRecipesWithImages
    .filter((recipe) => recipe.sourceName === "Heart Foundation" && !importedNames.has(recipe.name))
    .map((recipe) => ({
      id: `external-${recipe.id}`,
      name: recipe.name,
      description: `${recipe.description} Source: Australian Heart Foundation.`,
      minutes: recipe.minutes,
      proteinGrams: null,
      servings: recipe.servings ?? 1,
      imageUrl: recipe.imageUrl,
      mealType: getRecipeMealType(recipe),
      instructions: [],
      ingredients: [],
      source: "external",
      originalSourceName: "Australian Heart Foundation",
      originalSourceUrl: recipe.sourceUrl,
    }));

  const allRecipes = [...completeRecipes, ...catalogueRecipes]
    .sort((left, right) => left.name.localeCompare(right.name));
  const availableRecipeIds = new Set(allRecipes.map((recipe) => recipe.id));
  const plan: Record<string, PlannerDayPlan> = {};
  for (const entry of savedPlan?.entries ?? []) {
    const day = plannerDays[entry.day];
    if (!day || !availableRecipeIds.has(entry.recipeKey)) continue;
    const slot = isPlannerMealSlot(entry.slot) ? entry.slot : "dinner";
    const dayPlan = plan[day.key] ?? {};
    dayPlan[slot] = { recipeId: entry.recipeKey, servings: entry.servings };
    plan[day.key] = dayPlan;
  }
  const recipeById = new Map(allRecipes.map((recipe) => [recipe.id, recipe]));
  const selectedMeals = plannerDays.flatMap((day) => plannerMealSlots.flatMap((slot) => {
    const selection = plan[day.key]?.[slot.key];
    return selection ? [{ dayKey: day.key, slot: slot.key, selection }] : [];
  }));
  const plannedIngredients = selectedMeals.flatMap(({ selection }) =>
    recipeById.get(selection.recipeId)?.ingredients ?? []);
  const products = userId
    ? await getRecipeProductCatalogue(plannedIngredients)
    : [];
  const availability = calculatePlannerAvailability(
    selectedMeals,
    allRecipes,
    products,
  );

  return {
    recipes: allRecipes,
    pantryItems: pantryItems.map((item) => ({
      productId: item.productId,
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
    weekStart: weekStart.toISOString(),
    plan,
    dayAvailability: availability.dayAvailability,
    missingIngredients: availability.missingIngredients,
  };
}
