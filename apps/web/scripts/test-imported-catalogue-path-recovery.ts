import assert from "node:assert/strict";
import { canonicalAldiExternalId, canonicalRetailerProductUrl, currentRetailerCatalogueIndex, drakesProductExternalId, listingAppearsInCurrentRetailerCatalogue, needsAuthoritativeCategoryPathRestore, unambiguousRetailerNamePaths, unambiguousRetailerUrlPaths } from "./imported-catalogue-path-recovery";

assert.equal(needsAuthoritativeCategoryPathRestore(null), true);
assert.equal(needsAuthoritativeCategoryPathRestore("Legacy shelf 8"), true);
assert.equal(needsAuthoritativeCategoryPathRestore("Dairy & eggs"), true);
assert.equal(needsAuthoritativeCategoryPathRestore("/category/dairy"), false);
assert.equal(needsAuthoritativeCategoryPathRestore("/products/dairy-eggs-fridge/k/960000000"), false);
assert.equal(needsAuthoritativeCategoryPathRestore("/category/general-merchandise"), false);
assert.equal(canonicalAldiExternalId("0005428639"), "5428639");
assert.equal(canonicalAldiExternalId("0"), "0");
assert.equal(canonicalAldiExternalId("not-an-id"), null);
assert.equal(drakesProductExternalId("089:norco-full-cream-fresh-milk-2l"), "norco-full-cream-fresh-milk-2l");
assert.equal(drakesProductExternalId("not-a-drakes-id"), null);
assert.equal(canonicalRetailerProductUrl("https://www.drakes.com.au/product/milk/#details"), "https://www.drakes.com.au/product/milk");
assert.equal(canonicalRetailerProductUrl("not a URL"), null);

const namePaths = unambiguousRetailerNamePaths([
  { name: "Bickfords Creamy Soda Cordial", categoryPath: "/category/drinks" },
  { name: "Bickfords Creamy Soda Cordial", categoryPath: "/category/drinks/cordial" },
  { name: "Mixed product", categoryPath: "/category/drinks" },
  { name: "Mixed product", categoryPath: "/category/pantry" },
]);
assert.equal(namePaths.get("bickfords creamy soda cordial"), "/category/drinks");
assert.equal(namePaths.get("mixed product"), null);

const urlPaths = unambiguousRetailerUrlPaths([
  { productUrl: "https://www.drakes.com.au/product/cordial", categoryPath: "/category/drinks" },
  { productUrl: "https://www.drakes.com.au/product/cordial/", categoryPath: "/category/drinks/cordial" },
  { productUrl: "https://www.drakes.com.au/product/mixed", categoryPath: "/category/drinks" },
  { productUrl: "https://www.drakes.com.au/product/mixed", categoryPath: "/category/pantry" },
]);
assert.equal(urlPaths.get("https://www.drakes.com.au/product/cordial"), "/category/drinks");
assert.equal(urlPaths.get("https://www.drakes.com.au/product/mixed"), null);

const aldiIndex = currentRetailerCatalogueIndex([
  { externalId: "0005428639", name: "Coles Simply Table Spread 1kg", productUrl: "https://example.test/spread" },
], "ALDI");
assert.equal(listingAppearsInCurrentRetailerCatalogue({ retailer: "ALDI", externalId: "5428639", retailerProductName: "Different title", productUrl: null }, aldiIndex), true);
assert.equal(listingAppearsInCurrentRetailerCatalogue({ retailer: "ALDI", externalId: null, retailerProductName: "Coles Simply Table Spread 1kg", productUrl: null }, aldiIndex), false);
assert.equal(listingAppearsInCurrentRetailerCatalogue({ retailer: "ALDI", externalId: "999", retailerProductName: "Old listing", productUrl: null }, aldiIndex), false);

const drakesIndex = currentRetailerCatalogueIndex([
  { externalId: "norco-full-cream-fresh-milk-2l", name: "Norco Full Cream Fresh Milk 2L", productUrl: "https://www.drakes.com.au/product/norco-full-cream-fresh-milk-2l" },
], "Drakes", "089");
assert.equal(listingAppearsInCurrentRetailerCatalogue({ retailer: "Drakes", externalId: "089:norco-full-cream-fresh-milk-2l", retailerProductName: "Old milk title", productUrl: null }, drakesIndex), true);
assert.equal(listingAppearsInCurrentRetailerCatalogue({ retailer: "Drakes", externalId: "089:old-milk", retailerProductName: "Old milk title", productUrl: "https://www.drakes.com.au/product/norco-full-cream-fresh-milk-2l" }, drakesIndex), true);
assert.equal(listingAppearsInCurrentRetailerCatalogue({ retailer: "Drakes", externalId: "089:old-milk", retailerProductName: "Old milk title", productUrl: null }, drakesIndex), false);
assert.equal(listingAppearsInCurrentRetailerCatalogue({ retailer: "Drakes", externalId: "087:norco-full-cream-fresh-milk-2l", retailerProductName: "Same product at old store", productUrl: "https://www.drakes.com.au/product/norco-full-cream-fresh-milk-2l" }, drakesIndex), false);

console.log("imported catalogue path recovery tests passed");
