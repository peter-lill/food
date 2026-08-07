import assert from "node:assert/strict";
import {
  areEquivalentShoppingIngredients,
  getIngredientAvailability,
  mergeShoppingQuantity,
  recipeProductQueryCandidates,
  type RecipeProductIdentity,
} from "../src/lib/recipes/recipe-pantry";

const products: RecipeProductIdentity[] = [
  {
    id: "apple",
    name: "Royal Gala Apples",
    canonicalName: "Apple",
    aliases: ["fresh apples", "gala apple"],
    inventory: [{ quantity: 4, unit: "each" }],
  },
  {
    id: "coriander",
    name: "Coriander",
    canonicalName: "Coriander",
    aliases: ["cilantro"],
    inventory: [{ quantity: 1, unit: "bunch" }],
  },
  {
    id: "pineapple",
    name: "Pineapple",
    canonicalName: "Pineapple",
    aliases: [],
    inventory: [{ quantity: 1, unit: "each" }],
  },
];

assert.equal(
  getIngredientAvailability({ name: "Apple", quantity: 3, unit: "each", productId: "apple" }, products).status,
  "in-pantry",
  "canonical Ingredient.productId should match pantry stock",
);

assert.equal(
  getIngredientAvailability({ name: "Banana", quantity: 2, unit: "each" }, products).status,
  "missing",
  "an ingredient without a canonical product or stock should be missing",
);

assert.equal(
  getIngredientAvailability({ name: "Cilantro", quantity: null, unit: null }, products).productId,
  "coriander",
  "an exact product alias should resolve to its canonical product",
);

assert.equal(
  getIngredientAvailability({ name: "Apple", quantity: 1, unit: "each" }, products.filter((product) => product.id === "pineapple")).status,
  "missing",
  "a substring such as apple in pineapple must not count as a pantry match",
);

const queryCandidates = recipeProductQueryCandidates([
  { name: "Apple", quantity: 1, unit: "each", productId: "apple" },
  { name: "Cilantro", quantity: null, unit: null },
]);
assert.ok(queryCandidates.productIds.includes("apple"), "candidate lookup should retain canonical Ingredient.productId");
assert.ok(queryCandidates.slugs.includes("apple"), "candidate lookup should include canonical product slugs");
assert.ok(queryCandidates.normalisedAliases.includes("cilantro"), "candidate lookup should include exact ingredient aliases");
assert.ok(queryCandidates.normalisedAliases.includes("coriander"), "candidate lookup should include alias canonical identities");
assert.ok(!queryCandidates.normalisedAliases.includes("pineapple"), "candidate lookup must not expand to substring matches");

const missing = [
  getIngredientAvailability({ name: "Apple", quantity: 2, unit: "each" }, products),
  getIngredientAvailability({ name: "Banana", quantity: 3, unit: "each" }, products),
].filter((ingredient) => ingredient.status !== "in-pantry");
assert.deepEqual(missing.map((ingredient) => ingredient.name), ["Banana"], "only missing ingredients should be added to shopping");

assert.equal(
  areEquivalentShoppingIngredients(
    { name: "Gala apple", productId: "apple" },
    { name: "Apple", productId: "apple" },
  ),
  true,
  "shopping items sharing a canonical product must be reused",
);
assert.deepEqual(
  mergeShoppingQuantity({ quantity: 2, unit: "each" }, { quantity: 3, unit: "each" }),
  { quantity: 5, unit: "each" },
  "reused shopping items should preserve and combine compatible quantities",
);

console.log("Recipe pantry and shopping regression checks passed.");
