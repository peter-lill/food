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

  // Modifier words must not override the product noun.
  ["Beer Batter Shoestring Fries 750g", "Frozen", "Frozen food"],
  ["Beer Batter Steak Cut Chips 750g", "Frozen", "Frozen food"],
  ["Beer Glasses 2 Pack", "Home, kitchen & appliances", "Drinkware"],
  ["Barambah Organics Bush Honey Pot Set Yoghurt 1kg", "Dairy & eggs", "Yoghurt"],
  ["Arizona Green Tea With Ginseng & Honey", "Drinks", "Tea"],
  ["Banana Pancake and Waffle Mix", "Pantry", "Baking"],
  ["Banana Protein Pudding 170g", "Dairy & eggs", "Chilled desserts"],
  ["Arnotts Ginger Nut Biscuits", "Confectionery", "Biscuits & cookies"],
  ["Arnotts Lemon Crisp Biscuits", "Confectionery", "Biscuits & cookies"],
  ["Arnotts Orange Slice Biscuits", "Confectionery", "Biscuits & cookies"],
  ["Smoked Oysters in BBQ Sauce 85g", "Pantry", "Canned food, soups & noodles"],

  // Obvious retail-wide identities should not remain Other.
  ["10.1\" Tablet", "Electronics & technology", "Electronics & technology"],
  ["20W Wall Charger", "Electronics & technology", "Electronics & technology"],
  ["2.0 Channel Soundbar", "Electronics & technology", "Electronics & technology"],
  ["2 in 1 Cordless Stick Vacuum", "Home, kitchen & appliances", "Appliances"],
  ["1st Steps Baby Bottle Brush Set Single Pack", "Baby", "Baby accessories"],
  ["1st Steps Bowl With Spoon & Travel Set Single Pack", "Baby", "Baby accessories"],
  ["Appetito Duel Digital Timer 100 Hours", "Home, kitchen & appliances", "Kitchen tools & utensils"],
  ["Armor All Windscreen Wash", "Automotive", "Car care"],
];

for (const [name, department, shelf] of cases) {
  const actual = classifyProductText(name);
  assert.equal(actual.department, department, `${name}: expected ${department}, got ${actual.department} (${actual.reason})`);
  assert.equal(actual.shelf, shelf, `${name}: expected shelf ${shelf}, got ${actual.shelf}`);
}

console.log(`Taxonomy collision regression passed: ${cases.length} cases.`);
