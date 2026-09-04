import assert from "node:assert/strict";
import { currentRetailerCatalogueIndex, listingAppearsInCurrentRetailerCatalogue, staleRetailerListingIds } from "./imported-catalogue-path-recovery";

const currentAldi = currentRetailerCatalogueIndex([
  { externalId: "000123", name: "Current grocery product", productUrl: "https://example.test/current" },
], "ALDI");

assert.equal(listingAppearsInCurrentRetailerCatalogue({ retailer: "ALDI", externalId: "123", retailerProductName: "Old title", productUrl: null }, currentAldi), true);
assert.equal(listingAppearsInCurrentRetailerCatalogue({ retailer: "ALDI", externalId: null, retailerProductName: "Current grocery product", productUrl: null }, currentAldi), false);
assert.equal(listingAppearsInCurrentRetailerCatalogue({ retailer: "ALDI", externalId: "456", retailerProductName: "Discontinued product", productUrl: null }, currentAldi), false);

const currentDrakes = currentRetailerCatalogueIndex([
  { externalId: "current-drakes", name: "Current Drakes product", productUrl: null },
], "Drakes", "089");
assert.deepEqual(staleRetailerListingIds([
  { id: "aldi-current", retailer: "ALDI", externalId: "000123", retailerProductName: "Current", productUrl: null },
  { id: "aldi-stale", retailer: "ALDI", externalId: "999", retailerProductName: "Stale", productUrl: null },
  { id: "drakes-current", retailer: "Drakes", externalId: "089:current-drakes", retailerProductName: "Current", productUrl: null },
  { id: "drakes-old-store", retailer: "Drakes", externalId: "087:current-drakes", retailerProductName: "Current elsewhere", productUrl: null },
  { id: "coles-ignored", retailer: "Coles", externalId: "999", retailerProductName: "Unrelated", productUrl: null },
], { ALDI: currentAldi, Drakes: currentDrakes }), ["aldi-stale", "drakes-old-store"]);

console.log("stale imported catalogue retirement tests passed");
