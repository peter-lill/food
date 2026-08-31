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
  ["1st Steps Baby Wash Cloth Blue Lime Purple 5 Pack", "Baby", "Baby accessories"],
  ["Banana Boat Aloe Vera Gel", "Health & personal care", "Health & personal care"],
  ["Beef Jerky With Tomato Treats 200g", "Meat & seafood", "Fresh meat & seafood"],
  ["Admiral Mandarin Segments In Syrup", "Pantry", "Canned food, soups & noodles"],
  ["Banana Muffin Bars 10 Pack 420g", "Bakery", "Cakes & bakery"],
  ["Baked Provisions Carrot Cake Slice 2 Pack", "Bakery", "Cakes & bakery"],
  ["Baked Provisions Spinach & Ricotta Roll 2 Pack", "Bakery", "Savoury bakery"],
  ["Bakers Collection Gluten Free Good Health Jam Creams Biscuits", "Confectionery", "Biscuits & cookies"],
  ["Bakers Collection Lemon Slice 6 Pack", "Bakery", "Cakes & bakery"],

  // Obvious retail-wide identities should not remain Other.
  ["10.1\" Tablet", "Electronics & technology", "Electronics & technology"],
  ["20W Wall Charger", "Electronics & technology", "Electronics & technology"],
  ["2.0 Channel Soundbar", "Electronics & technology", "Electronics & technology"],
  ["2 in 1 Cordless Stick Vacuum", "Home, kitchen & appliances", "Appliances"],
  ["1st Steps Baby Bottle Brush Set Single Pack", "Baby", "Baby accessories"],
  ["1st Steps Bowl With Spoon & Travel Set Single Pack", "Baby", "Baby accessories"],
  ["Appetito Duel Digital Timer 100 Hours", "Home, kitchen & appliances", "Kitchen tools & utensils"],
  ["Armor All Windscreen Wash", "Automotive", "Car care"],
  ["1st Steps Bath Boats Multi Colour 4 Pack", "Baby", "Baby accessories"],
  ["1st Steps Fork And Spoon With Suction Cup Base And Travel Box 3 Pack", "Baby", "Baby accessories"],
  ["1st Steps Storage Pots With Spoon Purple Blue Bpa Free 3 Pack", "Baby", "Baby accessories"],
  ["3 Blade Razor System 8 Pack", "Health & personal care", "Health & personal care"],
  ["3 Minute Clean Denture Cleaning Tablets 48 Pack", "Health & personal care", "Health & personal care"],
  ["3D Wooden Puzzle", "Toys, games & entertainment", "Toys & games"],
  ["3m Command Clear Mini Hanging Hooks 6x Hooks 8x Small Strips 6 Pack", "Household", "Home organisation & storage"],
  ["4 Way Surge Powerboard", "Electronics & technology", "Electronics & technology"],
  ["9V Batteries 4 Pack", "Electronics & technology", "Electronics & technology"],
  ["AA Batteries 10 Pack", "Electronics & technology", "Electronics & technology"],
  ["AAA Batteries 14 Pack", "Electronics & technology", "Electronics & technology"],
  ["AMOLED Smart Watch with Interchangeable Strap", "Electronics & technology", "Electronics & technology"],
  ["50L Motion Sensor Automatic Bin", "Household", "Home organisation & storage"],
  ["8 Pattern Spray Nozzle", "Garden & outdoor", "Garden & outdoor"],
  ["Acurite Mechanical Kitchen Scale / 5kg", "Home, kitchen & appliances", "Kitchen tools & utensils"],
  ["Adult Tin Games", "Toys, games & entertainment", "Toys & games"],
  ["Alula Gold Follow On Formula Stage 2 6-12 Months", "Baby", "Baby food & care"],
  ["Advil Ibuprofen Tablets 24 Pack", "Health & personal care", "Health & personal care"],
  ["Anticol Throaties Lozenges 10 Pack", "Health & personal care", "Health & personal care"],
  ["Appetito 60 Minute Timer Square", "Home, kitchen & appliances", "Kitchen tools & utensils"],
  ["Appetito High Temp Baster", "Home, kitchen & appliances", "Kitchen tools & utensils"],
  ["Appetito Mesh Produce Bags 5 Pack", "Household", "Food storage & household"],
  ["Appetito Stainless Steel Straight Smoothie Straws With Brush 4 Pack", "Home, kitchen & appliances", "Kitchen tools & utensils"],
  ["Armor All Leather Wipes 24 Pack", "Automotive", "Car care"],
  ["Armor All Microfibre Glass Cloth Single Pack", "Automotive", "Car care"],
  ["Armor All Protectant", "Automotive", "Car care"],
];

for (const [name, department, shelf] of cases) {
  const actual = classifyProductText(name);
  assert.equal(actual.department, department, `${name}: expected ${department}, got ${actual.department} (${actual.reason})`);
  assert.equal(actual.shelf, shelf, `${name}: expected shelf ${shelf}, got ${actual.shelf}`);
}

console.log(`Taxonomy collision regression passed: ${cases.length} cases.`);
