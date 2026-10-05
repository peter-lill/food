import assert from "node:assert/strict";
import { comparablePackSize } from "../src/lib/products/retailer-product-identity";

const cases = [
  ["1.25L", "1250ml"],
  ["1.25 L", "1250ml"],
  ["0.6 L", "600ml"],
  ["600mL", "600ml"],
  ["10 x 375mL", "10x375ml"],
  ["375mL x 10 pack", "10x375ml"],
  ["375ml x 24", "24x375ml"],
  ["2kg", "2000g"],
] as const;

for (const [input, expected] of cases) assert.equal(comparablePackSize(input), expected, input);
assert.notEqual(comparablePackSize("400g"), comparablePackSize("1kg"));
assert.notEqual(comparablePackSize("10 x 375mL"), comparablePackSize("24 x 375mL"));
console.log("Catalogue repair pack regressions passed.");
