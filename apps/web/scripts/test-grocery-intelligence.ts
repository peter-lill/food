import assert from "node:assert/strict";
import { identifyGrocery } from "../src/lib/grocery-intelligence/identity";
import { genericImageIdentity } from "../src/lib/products/generic-image-policy";

const cases: Array<{
  input: string;
  canonical: string;
  family?: string | null;
  size?: string | null;
  preparation?: string[];
}> = [
  {
    input: "Large Zucchini",
    canonical: "Zucchini",
    size: "Large",
  },
  {
    input: "Small Zucchini Cut Into 2cm Thick Slices",
    canonical: "Zucchini",
    size: "Small",
    preparation: ["Cut Into Thick Slices"],
  },
  {
    input: "Small Green Apple Core Removed",
    canonical: "Green Apple",
    size: "Small",
    preparation: ["Core Removed"],
  },
  {
    input: ".Css 17zggtj Font Style Inherit Font Weight Inherit Webkit Text Decoration Inherit Text Decoration Inherit Apple Cored and",
    canonical: "Apple",
    preparation: ["Cored"],
  },
  {
    input: "Small Sweet Potato Unpeeled",
    canonical: "Sweet Potato",
    size: "Small",
    preparation: ["Unpeeled"],
  },
  {
    input: "Brown Rice",
    canonical: "Brown Rice",
  },
  {
    input: "Spring Onions Thinly Sliced",
    canonical: "Spring Onion",
    preparation: ["Thinly Sliced"],
  },
  {
    input: "Pine Nuts Lightly Toasted",
    canonical: "Pine Nuts",
    preparation: ["Lightly Toasted"],
  },
  {
    input: "Tablespoons Soy Sauce",
    canonical: "Soy Sauce",
    family: "Soy Sauce",
  },
  {
    input: "Teaspoon Baking Powder",
    canonical: "Baking Powder",
    family: "Baking Powder",
  },
  {
    input: "Kikkoman Soy Sauce 600mL",
    canonical: "Soy Sauce",
    family: "Soy Sauce",
  },
  {
    input: "Avocado Stoned Medium",
    canonical: "Avocado",
    family: "Avocado",
    preparation: ["Stone Removed"],
  },
  {
    input: "Chicken Breast Horizontally",
    canonical: "Chicken Breast",
    preparation: ["Cut Direction Removed"],
  },
  {
    input: "Carrot Halved Lengthways",
    canonical: "Carrot",
    preparation: ["Halved", "Cut Direction Removed"],
  },
  {
    input: "Freshly Grated Parmesan",
    canonical: "Parmesan",
    preparation: ["Grated", "Preparation Modifier Removed"],
  },
  {
    input: "Garlic Cloves",
    canonical: "Garlic Clove",
  },
];

for (const testCase of cases) {
  const result = identifyGrocery(testCase.input);
  assert.ok(result, `Expected an identity for ${JSON.stringify(testCase.input)}`);
  assert.equal(result.canonicalName, testCase.canonical, `Canonical grocery mismatch for ${JSON.stringify(testCase.input)}`);
  if ("family" in testCase) assert.equal(result.family, testCase.family ?? null, `Family mismatch for ${JSON.stringify(testCase.input)}`);
  if ("size" in testCase) assert.equal(result.size, testCase.size ?? null, `Size mismatch for ${JSON.stringify(testCase.input)}`);
  if (testCase.preparation) {
    for (const phrase of testCase.preparation) {
      assert.ok(result.preparation.includes(phrase), `Missing preparation ${JSON.stringify(phrase)} for ${JSON.stringify(testCase.input)}`);
    }
  }
}

console.log(`Grocery Intelligence ${cases.length} regression checks passed.`);

assert.equal(genericImageIdentity("Chicken Breast Horizontally"), "Chicken Breast");
assert.equal(genericImageIdentity("Freshly Grated Parmesan"), "Parmesan");
assert.equal(genericImageIdentity("Garlic Cloves"), "Garlic Clove");
assert.equal(genericImageIdentity("Cm Pieces"), null);
assert.equal(genericImageIdentity("Or Blueberries"), null);
assert.equal(genericImageIdentity("Coriander Leaves To Garnish"), "Coriander Leaves");
console.log("Generic image identity safety checks passed.");
