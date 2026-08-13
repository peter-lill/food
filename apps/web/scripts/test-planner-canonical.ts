import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { hwqSnackRecipes } from "../src/lib/recipes/hwq-snacks";
import bhfCatalogue from "../src/generated/bhf-recipes.json";
import { plannerRecipeCardView } from "../src/lib/planner/planner-card";
import { calculatePlannerAvailability } from "../src/lib/planner/planner-calculations";
import { plannerMealSlots, plannerRecipesForSlot, withPlannerMealSelection } from "../src/lib/planner/planner-meals";
import { currentPlannerWeekStart } from "../src/lib/planner/planner-week";
import type { PlannerRecipe } from "../src/lib/planner/planner.types";
import type { RecipeProductIdentity } from "../src/lib/recipes/recipe-pantry";
import { parseRecipeIngredientLine } from "../src/lib/recipes/recipe-pantry";

const appleRecipe: PlannerRecipe = {
  id: "apple-recipe",
  name: "Apple plate",
  description: null,
  minutes: 5,
  proteinGrams: null,
  servings: 2,
  imageUrl: null,
  instructions: [],
  ingredients: [{ name: "Apple", quantity: 2, unit: "each", productId: "apple" }],
  mealType: "Breakfast",
  source: "starter",
};

const flourRecipe: PlannerRecipe = {
  ...appleRecipe,
  id: "flour-recipe",
  name: "Flour recipe",
  servings: 1,
  ingredients: [{ name: "Plain flour", quantity: 500, unit: "g", productId: "flour" }],
};

const products: RecipeProductIdentity[] = [
  {
    id: "apple",
    name: "Royal Gala Apples",
    canonicalName: "Apple",
    aliases: ["gala apple"],
    inventory: [{ quantity: 3, unit: "each" }],
  },
  {
    id: "flour",
    name: "Plain Flour",
    canonicalName: "Plain Flour",
    aliases: [],
    inventory: [{ quantity: 750, unit: "g" }],
  },
];

const scaled = calculatePlannerAvailability(
  [{ dayKey: "monday", slot: "dinner", selection: { recipeId: appleRecipe.id, servings: 4 } }],
  [appleRecipe],
  products,
);
assert.equal(scaled.missingIngredients[0]?.status, "partial", "serving scaling should expose partial pantry stock");
assert.equal(scaled.missingIngredients[0]?.shoppingQuantity, 1, "shopping should receive only the scaled missing quantity");

const aliasMatched = calculatePlannerAvailability(
  [{ dayKey: "monday", slot: "breakfast", selection: { recipeId: "alias-apple", servings: 1 } }],
  [{ ...appleRecipe, id: "alias-apple", servings: 1, ingredients: [{ name: "Gala apple", quantity: 1, unit: "each" }] }],
  products,
);
assert.equal(aliasMatched.missingIngredients.length, 0, "a product alias should match canonical Pantry inventory");

const aggregated = calculatePlannerAvailability(
  [
    { dayKey: "monday", slot: "lunch", selection: { recipeId: flourRecipe.id, servings: 1 } },
    { dayKey: "monday", slot: "dinner", selection: { recipeId: flourRecipe.id, servings: 1 } },
  ],
  [flourRecipe],
  products,
);
assert.equal(aggregated.missingIngredients.length, 1, "equivalent weekly ingredients should aggregate to one shopping requirement");
assert.equal(aggregated.missingIngredients[0]?.shoppingQuantity, 250, "pantry stock should be subtracted once across the week");
assert.equal(aggregated.dayAvailability.monday?.lunch?.ingredientCount, 1, "Lunch should retain independent Pantry availability");
assert.equal(aggregated.dayAvailability.monday?.dinner?.ingredientCount, 1, "Dinner should retain independent Pantry availability");

const noSubstring = calculatePlannerAvailability(
  [{ dayKey: "monday", slot: "snacks", selection: { recipeId: appleRecipe.id, servings: 2 } }],
  [appleRecipe],
  [{ id: "pineapple", name: "Pineapple", canonicalName: "Pineapple", aliases: [], inventory: [{ quantity: 2, unit: "each" }] }],
);
assert.equal(noSubstring.missingIngredients[0]?.status, "missing", "Planner must not match apple to pineapple");

const selectedCard = plannerRecipeCardView(
  {
    ...appleRecipe,
    imageUrl: "/recipes/apple.webp",
    originalSourceName: "Test Kitchen",
  },
  { availableCount: 1, ingredientCount: 1, percent: 100 },
);
assert.deepEqual(
  selectedCard,
  {
    imageUrl: "/recipes/apple.webp",
    sourceLabel: "Test Kitchen",
    ingredientLabel: "1 ingredient",
    pantryPercent: 100,
  },
  "selected Planner meals should expose complete recipe-card presentation data",
);
assert.equal(
  plannerRecipeCardView(appleRecipe).pantryPercent,
  null,
  "new selections should show a pending Pantry check instead of a false zero",
);

assert.deepEqual(
  plannerMealSlots.map((slot) => slot.label),
  ["Breakfast", "Lunch", "Dinner", "Snacks"],
  "Planner should expose the four fixed daily meal slots",
);
const mainMealRecipe: PlannerRecipe = { ...appleRecipe, id: "main-meal", name: "Main meal", mealType: "Lunch & dinner" };
const snackRecipe: PlannerRecipe = { ...appleRecipe, id: "snack", name: "Snack", mealType: "Snacks" };
const plannerRecipes = [appleRecipe, mainMealRecipe, snackRecipe];
assert.deepEqual(plannerRecipesForSlot(plannerRecipes, "breakfast").map((recipe) => recipe.id), [appleRecipe.id]);
assert.deepEqual(plannerRecipesForSlot(plannerRecipes, "lunch").map((recipe) => recipe.id), [mainMealRecipe.id]);
assert.deepEqual(plannerRecipesForSlot(plannerRecipes, "dinner").map((recipe) => recipe.id), [mainMealRecipe.id]);
assert.deepEqual(plannerRecipesForSlot(plannerRecipes, "snacks").map((recipe) => recipe.id), [snackRecipe.id]);
assert.deepEqual(
  plannerRecipesForSlot(plannerRecipes, "breakfast", mainMealRecipe.id).map((recipe) => recipe.id),
  [appleRecipe.id, mainMealRecipe.id],
  "an older saved selection must remain visible while choosing a relevant replacement",
);

const plannerWorkspaceSource = readFileSync(
  new URL("../src/components/planner/PlannerWorkspace.tsx", import.meta.url),
  "utf8",
);
assert.doesNotMatch(plannerWorkspaceSource, /day\.short/, "Planner day cards should show Monday, not both Mon and Monday");
for (const sourcePath of ["../src/lib/planner/planner.repository.ts", "../src/lib/products/product-hub.repository.ts"]) {
  const source = readFileSync(new URL(sourcePath, import.meta.url), "utf8");
  const localRecipeImages = [...source.matchAll(/["'`](\/recipes\/[^"'`]+\.(?:avif|jpe?g|png|webp))["'`]/gi)]
    .map((match) => match[1]);
  assert.ok(localRecipeImages.length > 0, `${sourcePath} should expose local recipe images`);
  for (const imageUrl of localRecipeImages) {
    assert.ok(existsSync(new URL(`../public${imageUrl}`, import.meta.url)), `${imageUrl} must exist in the production public directory`);
  }
}
let multiMealPlan = withPlannerMealSelection({}, "monday", "breakfast", { recipeId: appleRecipe.id, servings: 2 });
multiMealPlan = withPlannerMealSelection(multiMealPlan, "monday", "dinner", { recipeId: flourRecipe.id, servings: 1 });
assert.equal(Object.keys(multiMealPlan.monday ?? {}).length, 2, "adding Dinner must not replace Breakfast");
multiMealPlan = withPlannerMealSelection(multiMealPlan, "monday", "breakfast", null);
assert.equal(multiMealPlan.monday?.dinner?.recipeId, flourRecipe.id, "clearing Breakfast must preserve Dinner");

const fixedSlotMigration = readFileSync(
  new URL("../prisma/migrations/20260808160000_fixed_planner_meal_slots/migration.sql", import.meta.url),
  "utf8",
);
assert.match(fixedSlotMigration, /DEFAULT 'dinner'/, "existing one-per-day meals should migrate into Dinner");
assert.match(fixedSlotMigration, /mealPlanId_day_slot/, "meal slots should be independently unique within each day");

const shoppingRepairMigration = readFileSync(
  new URL("../prisma/migrations/20260810191500_repair_recipe_shopping_items/migration.sql", import.meta.url),
  "utf8",
);
assert.match(shoppingRepairMigration, /Fat free Greek Style Natural Yoghurt/);
assert.match(shoppingRepairMigration, /"unit" = 'g'/);
assert.match(shoppingRepairMigration, /"unit" = 'ml'/);
assert.match(shoppingRepairMigration, /DELETE FROM "ShoppingItem"[\s\S]*'to serve'/i);

assert.equal(hwqSnackRecipes.length, 20, "all HWQ full recipe cards remain available to Planner");
assert.ok(bhfCatalogue.recipes.length > 0 && bhfCatalogue.recipes.every((recipe) => recipe.ingredients.length), "all BHF catalogue cards remain plannable");
assert.ok(bhfCatalogue.recipes.some((recipe) => recipe.instructions.length), "BHF full recipe methods remain available");
const beetrootRisotto = bhfCatalogue.recipes.find((recipe) => recipe.id === "bhf-beetroot-barley-risotto");
assert(beetrootRisotto);
const parsedRisottoIngredients = beetrootRisotto.ingredients
  .map(parseRecipeIngredientLine)
  .filter((ingredient) => ingredient.name.length > 0);
assert.deepEqual(
  parsedRisottoIngredients.map(({ name, quantity, unit }) => ({ name, quantity, unit })),
  [
    { name: "Olive Oil", quantity: 2, unit: "tsp" },
    { name: "Pearl Barley", quantity: 200, unit: "g" },
    { name: "Small Onion", quantity: 1, unit: "each" },
    { name: "Garlic", quantity: 1, unit: "each" },
    { name: "Beetroot", quantity: 200, unit: "g" },
    { name: "Vegetable Stock", quantity: 500, unit: "ml" },
    { name: "Pecan", quantity: 20, unit: "g" },
    { name: "Reduced fat Soft Cheese", quantity: 60, unit: "g" },
    { name: "Dill", quantity: 1, unit: "tbsp" },
    { name: "Rocket", quantity: 50, unit: "g" },
    { name: "Fat free Greek Style Natural Yoghurt", quantity: 80, unit: "g" },
  ],
  "recipe headings and preparation notes must not leak into shopping or price-search terms",
);
assert.deepEqual(parseRecipeIngredientLine("½ cup rolled oats"), { name: "Rolled Oats", quantity: 0.5, unit: "cup" });
assert.deepEqual(parseRecipeIngredientLine("400g (14oz) can chopped tomatoes"), { name: "Tomato", quantity: 1, unit: "can" });
assert.deepEqual(parseRecipeIngredientLine("50g/2oz sugar"), { name: "Sugar", quantity: 50, unit: "g" });
assert.deepEqual(parseRecipeIngredientLine("To serve: 60g rocket tossed with 1 tsp balsamic vinegar"), { name: "Rocket", quantity: 60, unit: "g" });
assert.deepEqual(parseRecipeIngredientLine("For the soup"), { name: "", quantity: null, unit: null });
const malformedCatalogueIngredients = bhfCatalogue.recipes.flatMap((recipe) => recipe.ingredients.flatMap((raw) => {
  const parsed = parseRecipeIngredientLine(raw);
  return (
    /\b(?:and|or|with|of)$/i.test(parsed.name) ||
    /^(?:To Serve|For )/i.test(parsed.name) ||
    /\b(?:fl\s*)?oz\b/i.test(parsed.name) ||
    /^\d/.test(parsed.name)
  ) ? [{ recipe: recipe.name, raw, parsed }] : [];
}));
assert.deepEqual(
  malformedCatalogueIngredients,
  [],
  "catalogue preparation notes, imperial alternatives and section labels must not become grocery products",
);
assert.equal(currentPlannerWeekStart(new Date("2026-08-09T14:00:00.000Z")).toISOString(), "2026-08-10T00:00:00.000Z", "Brisbane Monday anchors persisted weeks");

console.log("Canonical weekly Planner regression checks passed.");
