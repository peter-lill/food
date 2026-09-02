import assert from "node:assert/strict";
import type { SupermarketDepartment } from "../src/lib/products/product-category";
import { canRepairImportedCategory, categoryResolutionForImport, comparableProductCategoryKey } from "./catalogue-import-category-evidence";

const comparableCategories: Map<string, Set<SupermarketDepartment>> = new Map([
  ["milk", new Set<SupermarketDepartment>(["Dairy & eggs"])],
  ["bread", new Set<SupermarketDepartment>(["Bakery"])],
  ["chips", new Set<SupermarketDepartment>(["Pantry", "Confectionery"])],
]);

assert.equal(comparableProductCategoryKey("Full Cream Milk 2L"), "milk");
assert.equal(comparableProductCategoryKey("Campbells Condensed Cream Of Asparagus Soup"), null);
assert.equal(comparableProductCategoryKey("Brubecks Boutique Foods The Melbourne Pumpkin & Feta Pizza"), null);
assert.equal(comparableProductCategoryKey("Flatbread White 6 Pack 528g"), null);
assert.equal(comparableProductCategoryKey("Flatbread Dippers Feta & Olive"), "flatbread dippers");
assert.deepEqual(categoryResolutionForImport("Full Cream Milk 2L", comparableCategories), {
  category: "Dairy & eggs",
  productType: "DAIRY",
  source: "comparable-product",
});

// Conflicting comparable products are not evidence. Do not promote title
// keywords into a stored category.
assert.deepEqual(categoryResolutionForImport("Chips", comparableCategories), {
  category: "Other",
  productType: "OTHER",
  source: "unclassified",
});

// Regression cases for ALDI/Drakes' former independent keyword lists. These
// require retailer taxonomy or a corroborating comparable product, because a
// title alone cannot establish a reliable department.
assert.deepEqual(categoryResolutionForImport("Cadbury Dairy Milk Chocolate", new Map()), {
  category: "Other",
  productType: "OTHER",
  source: "unclassified",
});
assert.deepEqual(categoryResolutionForImport("Cotton Tea Towels", new Map()), {
  category: "Other",
  productType: "OTHER",
  source: "unclassified",
});

assert.equal(canRepairImportedCategory(categoryResolutionForImport("Cadbury Dairy Milk Chocolate", new Map()), "Dairy & eggs"), false);
assert.equal(canRepairImportedCategory(categoryResolutionForImport("Full Cream Milk 2L", comparableCategories), "Other"), true);

console.log("catalogue import category evidence tests passed");
