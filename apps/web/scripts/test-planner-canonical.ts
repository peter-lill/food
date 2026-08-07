import assert from "node:assert/strict";
import { hwqSnackRecipes } from "../src/lib/recipes/hwq-snacks";
import bhfCatalogue from "../src/generated/bhf-recipes.json";
import { calculatePlannerAvailability } from "../src/lib/planner/planner-calculations";
import { currentPlannerWeekStart } from "../src/lib/planner/planner-week";
import type { PlannerRecipe } from "../src/lib/planner/planner.types";
import type { RecipeProductIdentity } from "../src/lib/recipes/recipe-pantry";

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
  [{ dayKey: "monday", selection: { recipeId: appleRecipe.id, servings: 4 } }],
  [appleRecipe],
  products,
);
assert.equal(scaled.missingIngredients[0]?.status, "partial", "serving scaling should expose partial pantry stock");
assert.equal(scaled.missingIngredients[0]?.shoppingQuantity, 1, "shopping should receive only the scaled missing quantity");

const aliasMatched = calculatePlannerAvailability(
  [{ dayKey: "monday", selection: { recipeId: "alias-apple", servings: 1 } }],
  [{ ...appleRecipe, id: "alias-apple", servings: 1, ingredients: [{ name: "Gala apple", quantity: 1, unit: "each" }] }],
  products,
);
assert.equal(aliasMatched.missingIngredients.length, 0, "a product alias should match canonical Pantry inventory");

const aggregated = calculatePlannerAvailability(
  [
    { dayKey: "monday", selection: { recipeId: flourRecipe.id, servings: 1 } },
    { dayKey: "tuesday", selection: { recipeId: flourRecipe.id, servings: 1 } },
  ],
  [flourRecipe],
  products,
);
assert.equal(aggregated.missingIngredients.length, 1, "equivalent weekly ingredients should aggregate to one shopping requirement");
assert.equal(aggregated.missingIngredients[0]?.shoppingQuantity, 250, "pantry stock should be subtracted once across the week");

const noSubstring = calculatePlannerAvailability(
  [{ dayKey: "monday", selection: { recipeId: appleRecipe.id, servings: 2 } }],
  [appleRecipe],
  [{ id: "pineapple", name: "Pineapple", canonicalName: "Pineapple", aliases: [], inventory: [{ quantity: 2, unit: "each" }] }],
);
assert.equal(noSubstring.missingIngredients[0]?.status, "missing", "Planner must not match apple to pineapple");

assert.equal(hwqSnackRecipes.length, 20, "all HWQ full recipe cards remain available to Planner");
assert.ok(bhfCatalogue.recipes.length > 0 && bhfCatalogue.recipes.every((recipe) => recipe.ingredients.length), "all BHF catalogue cards remain plannable");
assert.ok(bhfCatalogue.recipes.some((recipe) => recipe.instructions.length), "BHF full recipe methods remain available");
assert.equal(currentPlannerWeekStart(new Date("2026-08-09T14:00:00.000Z")).toISOString(), "2026-08-10T00:00:00.000Z", "Brisbane Monday anchors persisted weeks");

console.log("Canonical weekly Planner regression checks passed.");
