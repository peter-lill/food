import assert from "node:assert/strict";
import { classifyProductText } from "../src/lib/products/product-category";

const cases: Array<[string, string, string | null]> = [
  ["Bic Atlantis Retractable Blue Pens 4 Pack", "Office & stationery", "Stationery"],
  ["Bic Brite Liner Grip Fluorescent Highlighter 5 Pack", "Office & stationery", "Stationery"],
  ["Bic Wite Out Correction Tape Single Pack", "Office & stationery", "Stationery"],
  ["Paracetamol Tablet 16 Pack", "Health & personal care", "Health & personal care"],
  ["Dental Floss Picks 100 Pack", "Health & personal care", "Health & personal care"],
  ["Plax Mouthwash 1L", "Health & personal care", "Health & personal care"],
  ["Ultimate Laundry Liquid 2L", "Household", "Cleaning & household"],
  ["Laundry Sanitiser 2L", "Household", "Cleaning & household"],
  ["Platinum Dish Capsules 46 pack", "Household", "Cleaning & household"],
  ["USB C to USB C Cable", "Electronics & technology", "Electronics & technology"],
  ["DEEBOT NEO 4.0 Robot Vacuum", "Electronics & technology", "Electronics & technology"],
  ["Wooden Kitchen Tools", "Home, kitchen & appliances", "Kitchen tools & utensils"],
  ["Cutting Boards 2 Pack", "Home, kitchen & appliances", "Kitchen tools & utensils"],
  ["Petrol Mower 141cc", "Garden & outdoor", "Garden & outdoor"],
  ["Women's Autumn Running Tight", "Clothing, footwear & accessories", "Clothing & footwear"],
  ["Yoga Equipment", "Sport, fitness & recreation", "Sport & fitness"],
  ["Deluxe Dartboard Set", "Sport, fitness & recreation", "Sport & fitness"],
  ["Picture Sound Books", "Toys, games & entertainment", "Toys & games"],
  ["DIY Science Sets", "Toys, games & entertainment", "Toys & games"],
  ["Dog Meaty Bites Chicken 1kg", "Pet", "Dog food & care"],
  ["Pepsi Max 2L", "Drinks", "Cold drinks"],
  ["Weissbier 500ml", "Beer, wine & spirits", "Beer, wine & spirits"],
  ["Pinot Grigio 750ml", "Beer, wine & spirits", "Beer, wine & spirits"],
  ["White Sourdough 500g", "Bakery", "Bread & bakery"],
  ["Croissants 8 Pack 440g", "Bakery", "Bread & bakery"],
  ["Danish Style Fetta 200g", "Dairy & eggs", "Cheese"],
  ["Beef Scotch Fillet 2 Pack", "Meat & seafood", "Fresh meat & seafood"],
  ["Pork Leg Roast Boneless", "Meat & seafood", "Fresh meat & seafood"],
  ["Pastrami Sliced 100g", "Deli", "Deli meat & antipasto"],
  ["Crispy Battered Fish Fillets 1kg", "Frozen", "Frozen food"],
  ["Party Sausage Rolls 24 Pack 900g", "Frozen", "Frozen food"],
  ["4 Bean Mix 420g", "Pantry", "Canned food, soups & noodles"],
  ["Peach Slices In Syrup 825g", "Pantry", "Canned food, soups & noodles"],
  ["Cous Cous 500g", "Pantry", "Pasta, rice & grains"],
  ["Parsley Flakes 13g", "Pantry", "Herbs & spices"],
  ["Vanilla Extract 100ml", "Pantry", "Baking"],
  ["Pine Nuts 100g", "Pantry", "Snacks"],
  ["Digestives Biscuits 400g", "Confectionery", "Biscuits & cookies"],
];

for (const [name, department, shelf] of cases) {
  const actual = classifyProductText(name);
  assert.equal(actual.department, department, `${name}: expected ${department}, got ${actual.department} (${actual.reason})`);
  assert.equal(actual.shelf, shelf, `${name}: expected shelf ${shelf}, got ${actual.shelf}`);
}

console.log(`Taxonomy family regression passed: ${cases.length} cases.`);
