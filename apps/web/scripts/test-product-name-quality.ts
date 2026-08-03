import assert from "node:assert/strict";
import { sanitiseProductName, validateProductName } from "../src/lib/product-intelligence/product-name-quality";

const unchanged = [
  "Brown Rice",
  "Brown Rice™",
  "O'Brien's Wholegrain Bread",
  "Salt & Pepper Crackers",
];

for (const name of unchanged) {
  assert.equal(sanitiseProductName(name), name, `Expected ${JSON.stringify(name)} to remain unchanged.`);
  assert.equal(validateProductName(name).changed, false, `Expected ${JSON.stringify(name)} not to be flagged as changed.`);
}

assert.equal(sanitiseProductName(". Brown Rice"), "Brown Rice");
assert.equal(validateProductName(". Brown Rice").changed, true);
assert.ok(validateProductName(". Brown Rice").issues.includes("name-leading-punctuation"));

const contaminated = ".css-17zggtj Font Style Inherit Font Weight Inherit Webkit Text Decoration Inherit Small Sweet Potato Unpeeled";
const contaminatedResult = validateProductName(contaminated);
assert.equal(contaminatedResult.changed, true);
assert.ok(contaminatedResult.issues.includes("name-contaminated"));
assert.ok(contaminatedResult.sanitised);
assert.notEqual(contaminatedResult.sanitised, contaminated);

assert.notEqual(sanitiseProductName("Brown Rice"), ". Brown Rice");
assert.notEqual(sanitiseProductName("Brown Rice"), "Brown. Rice");

console.log("Product name integrity regression tests passed.");
