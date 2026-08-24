import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import {
  externalRecipes,
  getRecipeMealType,
  recipeMealTypes,
} from "../src/lib/recipes/external-recipes";
import { hwqSnackRecipes } from "../src/lib/recipes/hwq-snacks";

assert.deepEqual(recipeMealTypes, [
  "Breakfast",
  "Lunch & dinner",
  "Snacks",
  "Desserts",
  "Sides & sauces",
  "Drinks",
]);

const hwqSnacks = externalRecipes.filter(
  (recipe) => recipe.sourceName === "Health and Wellbeing Queensland",
);
assert.equal(hwqSnacks.length, 20);
assert.equal(hwqSnacks.filter((recipe) => recipe.tags.includes("Savoury")).length, 11);
assert.equal(hwqSnacks.filter((recipe) => recipe.tags.includes("Sweet")).length, 9);
assert(hwqSnacks.every((recipe) => getRecipeMealType(recipe) === "Snacks"));
assert(hwqSnacks.every((recipe) => recipe.imageUrl?.startsWith("/recipes/hwq/") && recipe.imageUrl.endsWith(".webp")));
assert(hwqSnacks.every((recipe) => recipe.sourceUrl.startsWith("https://hw.qld.gov.au/healthy-recipes/")));

assert.equal(hwqSnackRecipes.length, 20);
assert.equal(hwqSnackRecipes.filter((recipe) => recipe.style === "Savoury").length, 11);
assert.equal(hwqSnackRecipes.filter((recipe) => recipe.style === "Sweet").length, 9);
assert(hwqSnackRecipes.every((recipe) => existsSync(`public${recipe.imageUrl}`)));
assert.deepEqual(
  new Set(hwqSnackRecipes.map((recipe) => recipe.id)),
  new Set(hwqSnacks.map((recipe) => recipe.id)),
);
assert(
  hwqSnackRecipes.every(
    (recipe) =>
      recipe.servings > 0 &&
      recipe.servingSizeGrams > 0 &&
      recipe.ingredients.length > 0 &&
      recipe.instructions.length > 0 &&
      recipe.notes.length > 0 &&
      recipe.imageUrl.length > 0 &&
      recipe.sourceUrl.length > 0 &&
      recipe.nutrition.energyKj > 0 &&
      recipe.nutrition.proteinGrams >= 0,
  ),
);

const breakfast = externalRecipes.find((recipe) => recipe.id === "hf-overnight-oats");
assert(breakfast);
assert.equal(getRecipeMealType(breakfast), "Breakfast");

const mainMeal = externalRecipes.find((recipe) => recipe.id === "rte-lentil-soup");
assert(mainMeal);
assert.equal(getRecipeMealType(mainMeal), "Lunch & dinner");

const redDuckCurry = externalRecipes.find((recipe) => recipe.id === "rte-thai-red-duck-curry");
assert.deepEqual(redDuckCurry && {
  name: redDuckCurry.name,
  sourceName: redDuckCurry.sourceName,
  sourceUrl: redDuckCurry.sourceUrl,
  minutes: redDuckCurry.minutes,
  servings: redDuckCurry.servings,
  prepMinutes: redDuckCurry.prepMinutes,
  cookMinutes: redDuckCurry.cookMinutes,
  mealType: getRecipeMealType(redDuckCurry),
}, {
  name: "Thai Red Duck Curry",
  sourceName: "RecipeTin Eats",
  sourceUrl: "https://www.recipetineats.com/thai-red-duck-curry/",
  minutes: 45,
  servings: 5,
  prepMinutes: 15,
  cookMinutes: 30,
  mealType: "Lunch & dinner",
});
assert.equal(externalRecipes.some((recipe) => recipe.id === "rte-cauliflower-soup"), false);

console.log(`${hwqSnacks.length} Health and Wellbeing Queensland snacks classified with full recipe cards.`);
