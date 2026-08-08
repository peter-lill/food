import assert from "node:assert/strict";
import { retailerListingIdentity } from "../src/lib/retailers/retailer-listing-identity";

const pepsi = retailerListingIdentity({
  retailer: "Woolworths",
  externalId: null,
  productName: "Pepsi Max Cola No Sugar Soft Drink Bottle 1.25L",
  packSize: "1.25L",
});

assert.deepEqual(pepsi, {
  kind: "catalogue-identity",
  retailer: "Woolworths",
  retailerProductName: "Pepsi Max Cola No Sugar Soft Drink Bottle 1.25L",
  packSize: "1.25L",
});

const pepsiTwoLitre = retailerListingIdentity({
  retailer: "Woolworths",
  externalId: null,
  productName: "Pepsi Max Soft Drink Bottle 2L",
  packSize: "2L",
});
assert.notDeepEqual(pepsi, pepsiTwoLitre);

assert.deepEqual(retailerListingIdentity({
  retailer: "Woolworths",
  externalId: "12345",
  productName: "KitKat Chocolate Bar 42g",
  packSize: "42g",
}), { kind: "external-id", externalId: "12345" });

console.log("Retailer listing identity checks passed.");

