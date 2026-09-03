import assert from "node:assert/strict";
import type { SupermarketDepartment } from "../src/lib/products/product-category";
import { canRepairImportedCategory, categoryResolutionForImport, comparableProductCategoryKey, unanimousRetailerCategoryPath } from "./catalogue-import-category-evidence";

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
assert.deepEqual(categoryResolutionForImport("Any retailer product", new Map(), "/browse/dairy-eggs-fridge"), {
  category: "Dairy & eggs",
  productType: "DAIRY",
  source: "retailer-path",
});
assert.deepEqual(categoryResolutionForImport("Any retailer product", new Map(), "Fruit & Veg"), {
  category: "Fruit & vegetables",
  productType: "GENERIC_PRODUCE",
  source: "retailer-path",
});
assert.equal(unanimousRetailerCategoryPath(["/category/general-merchandise"]), "/category/general-merchandise");
assert.equal(unanimousRetailerCategoryPath(["/browse/dairy-eggs-fridge", "Dairy & eggs"]), "/browse/dairy-eggs-fridge");
assert.equal(unanimousRetailerCategoryPath(["Dairy & eggs", "Pantry"]), null);
assert.equal(unanimousRetailerCategoryPath(["Dairy & eggs", "/products/unknown"]), null);

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
assert.equal(canRepairImportedCategory(categoryResolutionForImport("Any retailer product", new Map(), "Household"), "Other"), true);

console.log("catalogue import category evidence tests passed");
