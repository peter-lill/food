import assert from "node:assert/strict";
import { classifyProductText } from "../src/lib/products/product-category";

const cases: Array<[string, string, string | null]> = [
  ["Air Wick Essential Oil Blue Eucalyptus & Cedarwood Diffuser Refill", "Household", "Cleaning & household"],
  ["Bega Peanut Butter Smooth 470g", "Pantry", "Jams, honey & spreads"],
  ["Macro Organic Coconut Cream 400mL", "Pantry", "Canned food, soups & noodles"],
  ["Baby Mum Mum Premium Rice Rusks Banana 12+ Months 18 Pack", "Baby", "Baby food & care"],
  ["Apple, Strawberry & Blueberry Baby Rice Puffs 8+ months 45g", "Baby", "Baby food & care"],
  ["Annabel Karmel Little Meals 1-4 Years Bolognese Pasta Bake", "Baby", "Baby food & care"],
  ["Marinated Honey Soy RSPCA Approved Chicken Drumsticks 1.5kg", "Meat & seafood", "Fresh meat & seafood"],
  ["RSPCA Approved Chicken Bites With Sriracha Mayonnaise 500g", "Meat & seafood", "Fresh meat & seafood"],
  ["Lemon Pepper Atlantic Salmon Fillets 250g", "Meat & seafood", "Fresh meat & seafood"],
  ["Beef Soup Bones", "Meat & seafood", "Fresh meat & seafood"],
  ["Bitemeat Tangy Pepper Air Dried Venison", "Meat & seafood", "Fresh meat & seafood"],
  ["Blue Wave Salt & Pepper Squid", "Meat & seafood", "Fresh meat & seafood"],
  ["Bertocchi Pure Boneless Virginian Honey Leg Ham", "Deli", "Deli meat & antipasto"],
  ["Arnotts Shapes Light & Crispy Honey Soy Chicken", "Pantry", "Snacks"],
  ["Arnotts Shapes Originals Cheddar", "Pantry", "Snacks"],
  ["Belvita Strawberry Yoghurt Sandwich Breakfast Biscuits 253g 5 pack", "Pantry", "Snacks"],
  ["Band Aid Assorted Plastic Breathable Sterile Shapes 50 Pack", "Health & personal care", "Health & personal care"],
  ["Apple Cider Vinegar Gummies 60 Pack", "Health & personal care", "Health & personal care"],
  ["Australian Botanical Soap Manuka Honey With Jojoba Oil Pure Plant Oil", "Health & personal care", "Health & personal care"],
  ["Al'Fez Moroccan Meatball Tagine Simmer Sauce Medium 425g", "Pantry", "Sauces & condiments"],
  ["Ayam Black Bean Sauce", "Pantry", "Sauces & condiments"],
  ["Ayam Thai Chilli Jam Medium Stir Fry Paste", "Pantry", "Sauces & condiments"],
  ["Ayam Thai Fried Rice Medium Rice Paste", "Pantry", "Sauces & condiments"],
  ["Yellowfin Tuna Italian Style in Oil 185g", "Pantry", "Canned food, soups & noodles"],
  ["777 Mackerel In Tomato Sauce", "Pantry", "Canned food, soups & noodles"],
  ["Black & Gold Sardines In Vegetable Oil", "Pantry", "Canned food, soups & noodles"],
  ["Always Fresh Anchovies In Extra Virgin Olive Oil", "Pantry", "Canned food, soups & noodles"],
  ["Always Fresh Cucumbers Bread & Butter 700g", "Pantry", "Pickled vegetables & condiments"],
  ["Always Fresh Stuffed Olives Parmesan", "Pantry", "Pickled vegetables & condiments"],
  ["Angas Park Soft & Juice Pitted Prunes 250g", "Pantry", "Snacks"],
  ["Ardmona Rich & Thick Mixed Herbs Diced Tomatoes With Paste", "Pantry", "Canned food, soups & noodles"],
  ["Cling Wrap 60m", "Household", "Cleaning & household"],
  ["Banana Bread Mix 400g", "Pantry", "Baking"],
  ["Anchor Lighthouse Bread & Pizza Plain Flour", "Pantry", "Baking"],
  ["Abbotts Bakery High Protein Soy Chickpea & Quinoa Bread", "Bakery", "Bread & bakery"],
  ["Apple & Cinnamon Muffins 4 Pack", "Bakery", "Bread & bakery"],
  ["Always Fresh Grissini Rosemary & Sea Salt Italian Bread Sticks", "Bakery", "Bread & bakery"],
  ["Always Fresh Crustini Olive Oil & Sea Salt Italian Bruschetta Toasts", "Bakery", "Bread & bakery"],
  ["Alfa One Rice Bran Oil", "Pantry", "Oils & vinegars"],
  ["Woolworths Peach Slices In Juice 825g", "Pantry", "Canned food, soups & noodles"],
  ["Queen Sugar Free Chocolate Fudge Topping 355mL", "Pantry", "Desserts"],
  ["Woolworths Natural Plain Waffle Cones 12 pack", "Pantry", "Desserts"],
  ["Birds Eye Golden Crunch Super Crunch Chips", "Frozen", "Frozen food"],
  ["Birds Eye Golden Crunch Lattice Crispy Potato Chips", "Frozen", "Frozen food"],
  ["Birds Eye Golden Crunch Sidewinders Twisty Potato Chips", "Frozen", "Frozen food"],
  ["Coke Zero Sugar 30x375ml", "Drinks", "Cold drinks"],
  ["23rd St Signature G&T Non Alcoholic No Sugar Cans", "Other", null],
  ["50% Less Sugar Dried Cranberries 250g", "Pantry", "Snacks"],
];

for (const [name, department, shelf] of cases) {
  const actual = classifyProductText(name);
  assert.equal(actual.department, department, `${name}: expected ${department}, got ${actual.department} (${actual.reason})`);
  assert.equal(actual.shelf, shelf, `${name}: expected shelf ${shelf}, got ${actual.shelf}`);
}

console.log(`Product taxonomy regression passed: ${cases.length} cases.`);
