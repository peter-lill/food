import assert from "node:assert/strict";
import { identifyGrocery } from "../src/lib/grocery-intelligence/identity";
import { genericImageIdentity } from "../src/lib/products/generic-image-policy";
import { productDepartment } from "../src/lib/products/product-category";

const cases: Array<{
  input: string;
  canonical: string;
  family?: string | null;
  size?: string | null;
  preparation?: string[];
}> = [
  {
    input: "Large Zucchini",
    canonical: "Zucchini",
    size: "Large",
  },
  {
    input: "Small Zucchini Cut Into 2cm Thick Slices",
    canonical: "Zucchini",
    size: "Small",
    preparation: ["Cut Into Thick Slices"],
  },
  {
    input: "Small Green Apple Core Removed",
    canonical: "Green Apple",
    size: "Small",
    preparation: ["Core Removed"],
  },
  {
    input: ".Css 17zggtj Font Style Inherit Font Weight Inherit Webkit Text Decoration Inherit Text Decoration Inherit Apple Cored and",
    canonical: "Apple",
    preparation: ["Cored"],
  },
  {
    input: "Small Sweet Potato Unpeeled",
    canonical: "Sweet Potato",
    size: "Small",
    preparation: ["Unpeeled"],
  },
  {
    input: "Brown Rice",
    canonical: "Brown Rice",
    family: "Rice",
  },
  {
    input: "Arborio Rice",
    canonical: "Arborio Rice",
    family: "Rice",
  },
  {
    input: "Basmati Rice",
    canonical: "Basmati Rice",
    family: "Rice",
  },
  {
    input: "Jasmine Rice",
    canonical: "Jasmine Rice",
    family: "Rice",
  },
  {
    input: "Spring Onions Thinly Sliced",
    canonical: "Spring Onion",
    preparation: ["Thinly Sliced"],
  },
  {
    input: "Pine Nuts Lightly Toasted",
    canonical: "Pine Nuts",
    preparation: ["Lightly Toasted"],
  },
  {
    input: "Tablespoons Soy Sauce",
    canonical: "Soy Sauce",
    family: "Soy Sauce",
  },
  {
    input: "Teaspoon Baking Powder",
    canonical: "Baking Powder",
    family: "Baking Powder",
  },
  {
    input: "Kikkoman Soy Sauce 600mL",
    canonical: "Soy Sauce",
    family: "Soy Sauce",
  },
  {
    input: "Avocado Stoned Medium",
    canonical: "Avocado",
    family: "Avocado",
    preparation: ["Stone Removed"],
  },
  {
    input: "Chicken Breast Horizontally",
    canonical: "Chicken Breast",
    preparation: ["Cut Direction Removed"],
  },
  {
    input: "Broccolini Ends",
    canonical: "Broccolini",
    family: "Broccolini",
    preparation: ["Ends Removed"],
  },
  {
    input: "Canned Cannellini Or Butter Bean",
    canonical: "Canned Cannellini Bean",
  },
  {
    input: "Cm Piece Ginger",
    canonical: "Ginger",
  },
  {
    input: "Coriander Leaves To Garnish",
    canonical: "Coriander",
    family: "Coriander",
  },
  {
    input: "Crusty Multigrain Bread",
    canonical: "Multigrain Bread",
    family: "Bread",
  },
  { input: "Extra Pinch Ground Cinnamon", canonical: "Ground Cinnamon", family: "Cinnamon" },
  { input: "Feta Cheese Crumbled", canonical: "Feta", family: "Feta", preparation: ["Crumbled"] },
  { input: "Mozzarella Cheese", canonical: "Mozzarella", family: "Mozzarella" },
  { input: "Simply Spread", canonical: "Margarine", family: "Margarine" },
  { input: "Raw Nut and Seed Mix", canonical: "Seed Mix", family: "Seed Mix" },
  { input: "Sticks Celery", canonical: "Celery", family: "Celery" },
  { input: "White Sandwich Loaf", canonical: "White Bread", family: "Bread" },
  { input: "Soft Wholemeal Sandwich Loaf", canonical: "Soft Wholemeal Sandwich Loaf", family: "Bread" },
  { input: "Coles Olive Oil Table Spread", canonical: "Coles Olive Oil Table Spread", family: "Margarine" },
  { input: "Firmly Packed Parsley Leaves", canonical: "Parsley", family: "Parsley" },
  { input: "Flat Leaf Parsley Leaves", canonical: "Parsley", family: "Parsley" },
  { input: "Garlic Clove", canonical: "Garlic", family: "Garlic" },
  { input: "Lebanese Cucumber Into Thin Ribbons With A Vegetable Peeler", canonical: "Lebanese Cucumber", family: "Cucumber" },
  { input: "Leek White Part Only", canonical: "Leek", family: "Leek" },
  { input: "Lemon Juice", canonical: "Lemon Juice", family: "Lemon" },
  { input: "Or Blueberries", canonical: "Blueberries" },
  { input: "Or Stir Fry Vegetable Mix", canonical: "Stir Fry Vegetable Mix" },
  { input: "Peas Thawed", canonical: "Peas", family: "Peas", preparation: ["Thawed"] },
  { input: "Pita Pocket Bread", canonical: "Pita Bread", family: "Bread" },
  { input: "Plain Greek Yoghurt Plus Teaspoons Extra", canonical: "Plain Greek Yoghurt" },
  { input: "Sage Leaves Torn", canonical: "Sage", family: "Sage", preparation: ["Torn"] },
  { input: "Salmon Into Cm Cubes", canonical: "Salmon", family: "Salmon", preparation: ["Cut Into Cubes"] },
  { input: "Sized Tomato", canonical: "Tomato", family: "Tomato" },
  { input: "Spinach Leaves", canonical: "Spinach", family: "Spinach" },
  { input: "Store Bought Basil Pesto", canonical: "Basil Pesto", family: "Basil Pesto" },
  { input: "Thyme Leaves", canonical: "Thyme", family: "Thyme" },
  { input: "Tortillas Approximately Per Tortilla", canonical: "Tortillas", family: "Tortillas" },
  {
    input: "Dutch Carrot Or Baby Carrot Lengthways",
    canonical: "Carrot",
    family: "Carrot",
    preparation: ["Cut Direction Removed"],
  },
  {
    input: "Carrot Halved Lengthways",
    canonical: "Carrot",
    preparation: ["Halved", "Cut Direction Removed"],
  },
  {
    input: "Freshly Grated Parmesan",
    canonical: "Parmesan",
    preparation: ["Grated", "Preparation Modifier Removed"],
  },
  {
    input: "Garlic Cloves",
    canonical: "Garlic",
    family: "Garlic",
  },
];

for (const testCase of cases) {
  const result = identifyGrocery(testCase.input);
  assert.ok(result, `Expected an identity for ${JSON.stringify(testCase.input)}`);
  assert.equal(result.canonicalName, testCase.canonical, `Canonical grocery mismatch for ${JSON.stringify(testCase.input)}`);
  if ("family" in testCase) assert.equal(result.family, testCase.family ?? null, `Family mismatch for ${JSON.stringify(testCase.input)}`);
  if ("size" in testCase) assert.equal(result.size, testCase.size ?? null, `Size mismatch for ${JSON.stringify(testCase.input)}`);
  if (testCase.preparation) {
    for (const phrase of testCase.preparation) {
      assert.ok(result.preparation.includes(phrase), `Missing preparation ${JSON.stringify(phrase)} for ${JSON.stringify(testCase.input)}`);
    }
  }
}

console.log(`Grocery Intelligence ${cases.length} regression checks passed.`);

assert.equal(genericImageIdentity("Chicken Breast Horizontally"), "Chicken Breast");
assert.equal(genericImageIdentity("Freshly Grated Parmesan"), "Parmesan");
assert.equal(genericImageIdentity("Garlic Cloves"), "Garlic");
assert.equal(genericImageIdentity("Cm Pieces"), null);
assert.equal(genericImageIdentity("Or Blueberries"), null);
assert.equal(genericImageIdentity("Coriander Leaves To Garnish"), "Coriander");
assert.equal(genericImageIdentity("Extra Virgin Olive Oil"), "Olive Oil");
assert.equal(genericImageIdentity("Pinch Ground Cinnamon"), "Ground Cinnamon");
assert.equal(genericImageIdentity("Sized Tomato"), "Tomato");
assert.equal(genericImageIdentity("Clove Garlic"), "Garlic");
assert.equal(genericImageIdentity("Mozzarella Cheese"), "Mozzarella");
assert.equal(genericImageIdentity("Oregano Leaves"), "Oregano");
assert.equal(genericImageIdentity("Mix"), null);
assert.equal(genericImageIdentity("Sweet Potato"), "Sweet Potato");
assert.equal(genericImageIdentity("Black Beans"), "Black Beans");
assert.equal(genericImageIdentity("Red Onion"), "Red Onion");
assert.equal(genericImageIdentity("Green Apple"), "Green Apple");
assert.equal(genericImageIdentity("Spaghetti"), "Spaghetti");
assert.equal(genericImageIdentity("Leeks"), "Leek");
assert.equal(genericImageIdentity("Korma Curry Paste"), "Korma Paste");
console.log("Generic image identity safety checks passed.");

assert.equal(productDepartment("Fresh produce", "Apple"), "Fruit & vegetables");
assert.equal(productDepartment("Seafood", "Salmon"), "Meat & seafood");
assert.equal(productDepartment("Fresh meat", "Chicken Breast"), "Meat & seafood");
assert.equal(productDepartment("Chilled", "Greek Yoghurt"), "Dairy & eggs");
assert.equal(productDepartment(null, "Basmati Rice"), "Pantry");
assert.equal(productDepartment("Diet cola soft drink", "Pepsi Max"), "Drinks");
assert.equal(productDepartment("Salts", "Sea Salt"), "Pantry");
assert.equal(productDepartment("International Foods", "Basmati Rice"), "Pantry");
assert.equal(productDepartment("Chocolate biscuity bars", "KitKat Milo Block"), "Confectionery");
assert.equal(productDepartment("Cleaning & Household", "Dishwashing Tablets"), "Household");
console.log("Product department checks passed.");
