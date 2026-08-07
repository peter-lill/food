import assert from "node:assert/strict";
import {
  externalRecipes,
  getRecipeMealType,
  recipeMealTypes,
} from "../src/lib/recipes/external-recipes";

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

const breakfast = externalRecipes.find((recipe) => recipe.id === "hf-overnight-oats");
assert(breakfast);
assert.equal(getRecipeMealType(breakfast), "Breakfast");

const mainMeal = externalRecipes.find((recipe) => recipe.id === "rte-lentil-soup");
assert(mainMeal);
assert.equal(getRecipeMealType(mainMeal), "Lunch & dinner");

console.log(`${hwqSnacks.length} Health and Wellbeing Queensland snacks classified successfully.`);
