import assert from "node:assert/strict";
import { classifyProductText } from "../src/lib/products/product-category";

const cases: Array<[string, string, string | null]> = [
  ["Air Wick Essential Oil Blue Eucalyptus & Cedarwood Diffuser Refill", "Household", "Cleaning & household"],
  ["Air Wick Botanica Jasmine & Sri Lankan Cinnamon Leaf Non-Aerosol Automatic Spray Refill", "Household", "Cleaning & household"],
  ["Bega Peanut Butter Smooth 470g", "Pantry", "Jams, honey & spreads"],
  ["Mayver's Crunchy Peanut Butter 375g", "Pantry", "Jams, honey & spreads"],
  ["Macro Organic Coconut Cream 400mL", "Pantry", "Canned food, soups & noodles"],
  ["Ayam 100% Natural Coconut Cream 400mL", "Pantry", "Canned food, soups & noodles"],
  ["Baby Mum Mum Premium Rice Rusks Banana 12+ Months 18 Pack", "Baby", "Baby food & care"],
  ["Baby Mum Mum Organic Rice Rusks Blueberry & Carrot 12+ Months 18 Pack", "Baby", "Baby food & care"],
  ["Apple, Strawberry & Blueberry Baby Rice Puffs 8+ months 45g", "Baby", "Baby food & care"],
  ["Marinated Honey Soy RSPCA Approved Chicken Drumsticks 1.5kg", "Meat & seafood", "Fresh meat & seafood"],
  ["Lemon Pepper Atlantic Salmon Fillets 250g", "Meat & seafood", "Fresh meat & seafood"],
  ["Bertocchi Pure Boneless Virginian Honey Leg Ham", "Deli", "Deli meat & antipasto"],
  ["Arnotts Shapes Light & Crispy Honey Soy Chicken", "Pantry", "Snacks"],
  ["Arnotts Shapes Light & Crispy Balsamic Vinegar & Sea Salt", "Pantry", "Snacks"],
  ["Arnotts Shapes Originals Cheddar", "Pantry", "Snacks"],
  ["Australian Botanical Soap Manuka Honey With Jojoba Oil Pure Plant Oil", "Health & personal care", "Health & personal care"],
  ["Australian Botanical Soap Sea Salt With Ocean Minerals Pure Plant Oil", "Health & personal care", "Health & personal care"],
  ["Al'Fez Moroccan Meatball Tagine Simmer Sauce Medium 425g", "Pantry", "Sauces & condiments"],
  ["Yellowfin Tuna Italian Style in Oil 185g", "Pantry", "Canned food, soups & noodles"],
  ["Black & Gold Sardines In Vegetable Oil", "Pantry", "Canned food, soups & noodles"],
  ["Cling Wrap 60m", "Household", "Cleaning & household"],
  ["McKenzie's Cream Of Tartar 125g", "Pantry", "Baking"],
  ["Banana Bread Mix 400g", "Pantry", "Baking"],
  ["Birds Custard Powder", "Pantry", "Baking"],
  ["Abbotts Bakery High Protein Soy Chickpea & Quinoa Bread", "Bakery", "Bread & bakery"],
  ["23rd St Signature G&T Non Alcoholic No Sugar Cans", "Other", null],
  ["50% Less Sugar Dried Cranberries 250g", "Other", null],
];

for (const [name, department, shelf] of cases) {
  const actual = classifyProductText(name);
  assert.equal(actual.department, department, `${name}: expected ${department}, got ${actual.department} (${actual.reason})`);
  assert.equal(actual.shelf, shelf, `${name}: expected shelf ${shelf}, got ${actual.shelf}`);
}

console.log(`Product taxonomy regression passed: ${cases.length} cases.`);
