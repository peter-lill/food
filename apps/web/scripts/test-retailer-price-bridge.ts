import assert from "node:assert/strict";

import { toRetailerCatalogueCandidate } from "../src/lib/prices/coles-woolworths-provider";

const candidate = toRetailerCatalogueCandidate({
  retailer: "Coles",
  name: "Kit Kat Milk Chocolate Block 160g",
  price: 5,
  wasPrice: 7.5,
  isSpecial: true,
  promotion: "2 for $10",
  unit: "160g",
  store: "coles",
  barcode: "9300605075753",
  imageUrl: null,
  productId: "12345",
  source: "coles-woolworths-mcp",
});

assert.ok(candidate);
assert.equal(candidate.productName, "Kit Kat Milk Chocolate Block 160g");
assert.equal(candidate.packSize, "160g");
assert.equal(candidate.isSpecial, true);
assert.equal(candidate.externalId, "12345");
assert.equal(candidate.sourceUrl, "https://www.coles.com.au/product/kit-kat-milk-chocolate-block-160g-12345");

console.log("Retailer bridge metadata regressions passed.");
