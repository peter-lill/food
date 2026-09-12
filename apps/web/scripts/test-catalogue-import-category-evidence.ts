import { ProductType } from "@prisma/client";
import assert from "node:assert/strict";
import type { SupermarketDepartment } from "../src/lib/products/product-category";
import { canRepairImportedCategory, categoryResolutionForImport, comparableProductCategoryKey, supportedRetailerCategoryPath, unanimousRetailerCategoryPath } from "./catalogue-import-category-evidence";

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
assert.deepEqual(categoryResolutionForImport("Baby bath wash", new Map(), ["/category/baby", "/category/baby-needs"]), {
  category: "Baby",
  productType: "PACKAGED",
  source: "retailer-path",
});
assert.deepEqual(categoryResolutionForImport("Any retailer product", new Map(), "Fruit & Veg"), {
  category: "Fruit & vegetables",
  productType: "GENERIC_PRODUCE",
  source: "retailer-path",
});
assert.deepEqual(categoryResolutionForImport("10K Powerbank", new Map(), "/category/general-merchandise"), {
  category: "Other",
  productType: "OTHER",
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

assert.equal(supportedRetailerCategoryPath("Remedy Kombucha Sparkling Live Cultured Drink", ["/category/dairy", "/category/drinks-1"], "Other"), "/category/drinks-1");
assert.equal(supportedRetailerCategoryPath("Sara Lee Carrot Cake", ["/category/bakery", "/category/freezer"], "Bakery"), "/category/bakery");
assert.equal(supportedRetailerCategoryPath("Brussels Sprouts 500g", ["/category/freezer", "/category/fruit-vegetables"], "Other"), "/category/fruit-vegetables");
assert.equal(supportedRetailerCategoryPath("Unknown product", ["/category/dairy", "/category/pantry"], "Other"), null);
// ALDI promotional collections are navigation/marketing evidence, not Food
// departments. When a product is also observed in a genuine taxonomy leaf,
// the genuine leaf must win regardless of catalogue observation order.
assert.equal(
  supportedRetailerCategoryPath(
    "Goat's Cheese Barrel Spreadable",
    [
      "/products/lower-prices/k/1588161420755353",
      "/products/dairy-eggs-fridge/cheese/k/1111111163",
    ],
    "Other",
  ),
  "/products/dairy-eggs-fridge/cheese/k/1111111163",
);
assert.equal(
  supportedRetailerCategoryPath(
    "Goat's Cheese Barrel Spreadable",
    [
      "/products/dairy-eggs-fridge/cheese/k/1111111163",
      "/products/lower-prices/k/1588161420755353",
    ],
    "Other",
  ),
  "/products/dairy-eggs-fridge/cheese/k/1111111163",
);
assert.equal(canRepairImportedCategory(categoryResolutionForImport("Any retailer product", new Map(), "Household"), "Other"), true);
assert.equal(canRepairImportedCategory(categoryResolutionForImport("10K Powerbank", new Map(), "/category/general-merchandise"), "Dairy & eggs"), true);

console.log("catalogue import category evidence tests passed");

// Packaged products sold in the produce department must retain packaged identity.
{
  const result = categoryResolutionForImport(
    "Fresh & Fast Stir Fry 400g",
    new Map(),
    "/products/fruit-vegetables",
  );
  assert.equal(result.category, "Fruit & vegetables");
  assert.equal(result.productType, ProductType.PACKAGED);
}
