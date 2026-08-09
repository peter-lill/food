import assert from "node:assert/strict";

import { bestProductImage, latestPricesByRetailer } from "../src/lib/products/product-hub.repository";
import { heroProductDescription } from "../src/lib/products/product-description";

assert.equal(
  bestProductImage(null, [], true),
  "stored://product-image",
  "a stored primary asset must keep a catalogue image visible when the legacy image URL is missing",
);
assert.equal(
  heroProductDescription("Origin: MADE IN AUSTRALIA. Ingredients: Sugar, milk powder."),
  "Origin: MADE IN AUSTRALIA.",
  "raw ingredient statements must not appear in the product hero description",
);

const observedAt = new Date("2026-08-09T00:00:00.000Z");
const prices = latestPricesByRetailer([
  { retailer: "Woolworths", price: 7.5, isSpecial: false, observedAt, storeProduct: { packSize: "160g" } },
  { retailer: "Coles", price: 3.75, isSpecial: true, observedAt: new Date("2026-08-09T00:01:00.000Z"), storeProduct: { packSize: "160g" } },
  { retailer: "Coles", price: 7.5, isSpecial: false, observedAt: new Date("2026-08-08T00:00:00.000Z"), storeProduct: { packSize: "160g" } },
]);

assert.deepEqual(prices.map(({ retailer, price, isSpecial }) => ({ retailer, price, isSpecial })), [
  { retailer: "Coles", price: 3.75, isSpecial: true },
  { retailer: "Woolworths", price: 7.5, isSpecial: false },
]);

console.log("Product retailer price display regressions passed.");
