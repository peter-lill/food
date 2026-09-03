import assert from "node:assert/strict";
import { currentRetailerCatalogueIndex, listingAppearsInCurrentRetailerCatalogue } from "./imported-catalogue-path-recovery";

const currentAldi = currentRetailerCatalogueIndex([
  { externalId: "000123", name: "Current grocery product", productUrl: "https://example.test/current" },
], "ALDI");

assert.equal(listingAppearsInCurrentRetailerCatalogue({ retailer: "ALDI", externalId: "123", retailerProductName: "Old title", productUrl: null }, currentAldi), true);
assert.equal(listingAppearsInCurrentRetailerCatalogue({ retailer: "ALDI", externalId: null, retailerProductName: "Current grocery product", productUrl: null }, currentAldi), false);
assert.equal(listingAppearsInCurrentRetailerCatalogue({ retailer: "ALDI", externalId: "456", retailerProductName: "Discontinued product", productUrl: null }, currentAldi), false);

console.log("stale imported catalogue retirement tests passed");
