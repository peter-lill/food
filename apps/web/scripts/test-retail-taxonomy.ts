import assert from "node:assert/strict";
import { classifyProductText } from "../src/lib/products/product-category";

const cases: Array<[string, string, string | null]> = [
  ["Sugar Cane Mulch", "Garden & outdoor", "Garden & outdoor"],
  ["Aurora Bath Towel Champagne 68cmx130cm", "Furniture & homewares", "Bathroom & homewares"],
  ["B Well Organic With The Mother Raw & Unfiltered Apple Cider Vinegar", "Pantry", "Oils & vinegars"],
  ["BBQ Sauce Signature 550g", "Pantry", "Sauces & condiments"],
  ["BBQ Sausages Bulk", "Meat & seafood", "Fresh meat & seafood"],
  ["On The Go Smokey BBQ Mix 45g", "Pantry", "Snacks"],
  ["Bark Sydney Sugar Glider Plush Dog Toy each", "Pet", "Pet accessories & toys"],
  ["Premi-Yum Frozen Chicken Mince Dog Food 1kg", "Pet", "Dog food & care"],
  ["Armada Freezer Bags Small 120 pack", "Household", "Food storage & household"],
  ["Hercules Resealable Sandwich Bags 40 pack", "Household", "Food storage & household"],
  ["Electric Salt and Pepper Mill", "Home, kitchen & appliances", "Kitchen tools & utensils"],
  ["MCoBeauty Eyelash Curler each", "Health & personal care", "Beauty tools & accessories"],
  ["Ambi Pur Car Air Freshener Premium Clip Aqua 7.5ml", "Automotive", "Car care"],
  ["Liqueur Cake Rum 400g", "Bakery", "Cakes & bakery"],
];

for (const [name, department, shelf] of cases) {
  const actual = classifyProductText(name);
  assert.equal(actual.department, department, `${name}: expected ${department}, got ${actual.department} (${actual.reason})`);
  assert.equal(actual.shelf, shelf, `${name}: expected shelf ${shelf}, got ${actual.shelf}`);
}

console.log(`Retail taxonomy regression passed: ${cases.length} cases.`);
