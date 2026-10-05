import assert from "node:assert/strict";
import { catalogueNamePackKey, sameSellablePack } from "../src/lib/products/catalogue-sku-identity";

assert.equal(sameSellablePack("1.25L", "1.25 L"), true);
assert.equal(sameSellablePack("0.6 L", "600mL"), true);
assert.equal(sameSellablePack("10 x 375mL", "375mL x 10 pack"), true);
assert.equal(sameSellablePack("24 x 375mL", "10 x 375mL"), false);
assert.equal(sameSellablePack("2L", "1.25L"), false);
assert.notEqual(
  catalogueNamePackKey("Pepsi Max Bottle", "2L"),
  catalogueNamePackKey("Pepsi Max Bottle", "1.25L"),
);
console.log("Catalogue SKU identity regressions passed.");
