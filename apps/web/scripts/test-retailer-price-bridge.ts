import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { toRetailerCatalogueCandidate } from "../src/lib/prices/coles-woolworths-provider";
import { identityScore, retailerSearchQuery } from "../src/lib/retailers/retailer-intelligence.service";

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

const kitKatScore = identityScore(
  {
    id: "kitkat-aero-mint",
    name: "Kitkat Aero Mint Chocolate Block",
    canonicalName: "Kitkat Aero Mint Chocolate Block",
    brand: "Nestlé",
    barcode: "9300605158696",
    packSize: "155g",
    imageUrl: null,
  },
  {
    retailer: "Coles",
    productName: "Kit Kat Aero Mint Chocolate Block 155g",
    price: 3.75,
    packSize: "155g",
    imageUrl: null,
    sourceUrl: "https://www.coles.com.au/product/kit-kat-aero-mint-block-chocolate-155g-1314693",
    externalId: "1314693",
    barcode: null,
    isSpecial: true,
  },
);
assert.ok(kitKatScore >= 900, "spacing differences in KitKat must not reject the exact Coles pack");

const kitKatProduct = {
  name: "Kitkat Aero Mint Chocolate Block",
  canonicalName: "Kitkat Aero Mint Chocolate Block",
  brand: "Nestlé",
  barcode: "9300605158696",
  packSize: "155g",
};
assert.equal(
  retailerSearchQuery(kitKatProduct),
  "9300605158696",
  "Every retailer uses the same barcode-first query when an exact product barcode is available",
);

const bridgeSource = readFileSync(new URL("../../../services/grocery-mcp/bridge.py", import.meta.url), "utf8");
assert.match(bridgeSource, /"code", "productId", "productCode"/);
assert.match(bridgeSource, /nested_text\(source, \("brand", "brandName", "manufacturer"\)\)/);
assert.match(bridgeSource, /root\.findall\("\.\/\/{\*}storeRank"\)/, "Woolworths XML namespaces remain supported");
assert.match(bridgeSource, /latitude_text/, "store lookup accepts an explicitly selected current location");
assert.match(bridgeSource, /COLES_STORE_LOCATOR_API_KEY/);
assert.match(bridgeSource, /brandIds[\s\S]*\["COL"\]/, "nearby Coles results exclude liquor brands");

console.log("Retailer bridge metadata regressions passed.");
