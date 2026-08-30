import assert from "node:assert/strict";
import { classifyProductText } from "../src/lib/products/product-category";

const cases: Array<[string, string, string | null]> = [
  ["California BBQ Marinated Split RSPCA Approved Chicken", "Meat & seafood", "Fresh meat & seafood"],
  ["BBQ RSPCA Approved Chicken Kebabs", "Meat & seafood", "Fresh meat & seafood"],
  ["Smokey BBQ Marinade 375g", "Pantry", "Sauces & condiments"],
  ["BBQ Rib Glaze 375g", "Pantry", "Sauces & condiments"],
  ["Smoky BBQ Tuna With Beans 160g", "Other", null],
  ["On The Go Smokey BBQ Mix 45g", "Pantry", "Snacks"],
  ["BBQ Flavour Potato Chips 175g", "Pantry", "Snacks"],
  ["Stone Baked BBQ Chicken Pizza 420g", "Frozen", "Frozen meals & pizza"],
  ["Portable BBQ Grill", "Garden & outdoor", "Barbecues & outdoor cooking"],
  ["BBQ Cover Large", "Garden & outdoor", "Barbecues & outdoor cooking"],
  ["Sugar Cane Mulch 30L", "Garden & outdoor", "Garden & outdoor"],
  ["23rd St Signature G&T Non Alcoholic No Sugar Cans", "Drinks", "Low & no alcohol adult drinks"],
];

for (const [name, department, shelf] of cases) {
  const actual = classifyProductText(name);
  assert.equal(actual.department, department, `${name}: expected ${department}, got ${actual.department} (${actual.reason})`);
  assert.equal(actual.shelf, shelf, `${name}: expected shelf ${shelf}, got ${actual.shelf}`);
}

console.log(`Taxonomy collision regression passed: ${cases.length} cases.`);
