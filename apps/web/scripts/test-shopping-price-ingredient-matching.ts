import assert from "node:assert/strict";
import {
  isExactShoppingPriceIngredientName,
  shoppingPriceIngredientName,
} from "../src/lib/prices/shopping-price-ingredient";

const cases = [
  ["A Few Coriander Leaves", "Coriander"],
  ["All Purpose Flour", "Plain Flour"],
  ["Eggs Beaten", "Eggs"],
  ["Medium Ripe Banana", "Banana"],
  ["Pinch of Ground Cumin", "Ground Cumin"],
  ["Small Red Onion", "Red Onion"],
] as const;

for (const [recipeText, expectedIngredient] of cases) {
  assert.equal(shoppingPriceIngredientName(recipeText), expectedIngredient, `${recipeText} should search as ${expectedIngredient}`);
}

assert.equal(isExactShoppingPriceIngredientName("Banana", "Bananas 1kg"), true, "plural produce with a size is an exact ingredient match");
assert.equal(isExactShoppingPriceIngredientName("Banana", "Cavendish Bananas Loose"), true, "a produce variety is an exact banana match");
assert.equal(isExactShoppingPriceIngredientName("Egg", "Barn Laid Eggs 700g"), true, "egg production qualifiers are an exact egg match");
assert.equal(isExactShoppingPriceIngredientName("Banana", "Banana Chips"), false, "a processed banana product is not an exact banana match");
assert.equal(isExactShoppingPriceIngredientName("Coriander", "Coriander Bunch"), true, "a herb bunch is an exact herb match");
assert.equal(isExactShoppingPriceIngredientName("Coriander", "Coriander Seeds Ground"), false, "ground coriander is not an exact fresh coriander match");

console.log("Shopping-list price ingredient matching regression checks passed.");
