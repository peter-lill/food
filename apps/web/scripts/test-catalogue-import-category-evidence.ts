import assert from "node:assert/strict";
import type { SupermarketDepartment } from "../src/lib/products/product-category";
import { canRepairImportedCategory, categoryResolutionForImport, comparableProductCategoryKey } from "./catalogue-import-category-evidence";

const comparableCategories: Map<string, Set<SupermarketDepartment>> = new Map([
  ["milk", new Set<SupermarketDepartment>(["Dairy & eggs"])],
  ["bread", new Set<SupermarketDepartment>(["Bakery"])],
  ["chips", new Set<SupermarketDepartment>(["Pantry", "Confectionery"])],
]);

assert.equal(comparableProductCategoryKey("Full Cream Milk 2L"), "milk");
assert.deepEqual(categoryResolutionForImport("Full Cream Milk 2L", comparableCategories), {
  category: "Dairy & eggs",
  productType: "DAIRY",
  source: "comparable-product",
});

// Conflicting comparable products are not evidence. Fall back to the shared,
// ordered name rules instead of forcing a category.
assert.deepEqual(categoryResolutionForImport("Chips", comparableCategories), {
  category: "Other",
  productType: "OTHER",
  source: "name-rules",
});

// Regression cases for ALDI/Drakes' former independent keyword lists.
assert.deepEqual(categoryResolutionForImport("Cadbury Dairy Milk Chocolate", new Map()), {
  category: "Confectionery",
  productType: "PACKAGED",
  source: "name-rules",
});
assert.deepEqual(categoryResolutionForImport("Cotton Tea Towels", new Map()), {
  category: "Household",
  productType: "HOUSEHOLD",
  source: "name-rules",
});

assert.equal(canRepairImportedCategory(categoryResolutionForImport("Cadbury Dairy Milk Chocolate", new Map()), "Dairy & eggs"), false);
assert.equal(canRepairImportedCategory(categoryResolutionForImport("Full Cream Milk 2L", comparableCategories), "Other"), true);

console.log("catalogue import category evidence tests passed");
