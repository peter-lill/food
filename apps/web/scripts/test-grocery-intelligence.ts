import assert from "node:assert/strict";
import { identifyGrocery } from "../src/lib/grocery-intelligence/identity";

const cases: Array<{
  input: string;
  canonical: string;
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
];

for (const testCase of cases) {
  const result = identifyGrocery(testCase.input);
  assert.ok(result, `Expected an identity for ${JSON.stringify(testCase.input)}`);
  assert.equal(result.canonicalName, testCase.canonical, `Canonical grocery mismatch for ${JSON.stringify(testCase.input)}`);
  if ("size" in testCase) assert.equal(result.size, testCase.size ?? null, `Size mismatch for ${JSON.stringify(testCase.input)}`);
  if (testCase.preparation) {
    for (const phrase of testCase.preparation) {
      assert.ok(result.preparation.includes(phrase), `Missing preparation ${JSON.stringify(phrase)} for ${JSON.stringify(testCase.input)}`);
    }
  }
}

console.log(`Grocery Intelligence ${cases.length} regression checks passed.`);
