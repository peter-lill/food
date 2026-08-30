import { normaliseProductText } from "./product-normalisation";

export const supermarketDepartments = [
  "Fruit & vegetables", "Bakery", "Meat & seafood", "Deli", "Dairy & eggs", "Frozen", "Pantry",
  "Confectionery", "Drinks", "Health & personal care", "Household", "Baby", "Pet", "Other",
] as const;
export type SupermarketDepartment = (typeof supermarketDepartments)[number];

export type ProductClassification = {
  department: SupermarketDepartment;
  shelf: string | null;
  confidence: "authoritative" | "high" | "medium" | "low";
  reason: string;
};

const departmentAliases = new Map<string, SupermarketDepartment>([
  ["fresh produce", "Fruit & vegetables"], ["produce", "Fruit & vegetables"], ["fruit and vegetables", "Fruit & vegetables"], ["fruit vegetables", "Fruit & vegetables"],
  ["fresh meat", "Meat & seafood"], ["seafood", "Meat & seafood"], ["meat and seafood", "Meat & seafood"], ["meat seafood", "Meat & seafood"],
  ["dairy eggs and fridge", "Dairy & eggs"], ["dairy eggs fridge", "Dairy & eggs"], ["dairy and eggs", "Dairy & eggs"], ["dairy eggs", "Dairy & eggs"], ["chilled", "Dairy & eggs"],
  ["freezer", "Frozen"], ["international", "Pantry"], ["international foods", "Pantry"], ["salt", "Pantry"], ["salts", "Pantry"], ["herbs and spices", "Pantry"],
  ["alcoholic beverage", "Drinks"], ["alcoholic beverages", "Drinks"], ["snacks and confectionery", "Confectionery"], ["snacks confectionery", "Confectionery"],
  ["health and beauty", "Health & personal care"], ["health beauty", "Health & personal care"], ["cleaning and household", "Household"], ["cleaning household", "Household"], ["pets", "Pet"],
]);
for (const department of supermarketDepartments) departmentAliases.set(normaliseProductText(department), department);

const canonicalDepartments = new Map<string, Exclude<SupermarketDepartment, "Other">>(
  supermarketDepartments.filter((d): d is Exclude<SupermarketDepartment, "Other"> => d !== "Other").map((d) => [normaliseProductText(d), d]),
);

const has = (text: string, terms: string[]) => terms.some((term) => new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+")}\\b`, "i").test(text));
const result = (department: SupermarketDepartment, shelf: string | null, confidence: ProductClassification["confidence"], reason: string): ProductClassification => ({ department, shelf, confidence, reason });

/** Shared fallback classifier for imports without a trustworthy retailer taxonomy.
 * Rules are ordered from specific to broad so ingredient words such as beef,
 * chicken, tuna, milk or apple cannot override the actual product class.
 */
export function classifyProductText(value: string): ProductClassification {
  const text = normaliseProductText(value);
  if (!text) return result("Other", null, "low", "no usable classification text");

  if (has(text, ["dog food", "cat food", "pet food", "dog treat", "cat treat", "pet treat", "dog biscuit", "cat litter"])) return result("Pet", has(text, ["dog"]) ? "Dog food & care" : has(text, ["cat"]) ? "Cat food & care" : "Pet food & care", "high", "explicit pet product");
  if (has(text, ["baby formula", "infant formula", "toddler formula", "baby food", "baby puree", "baby snack", "toddler snack", "nappy", "nappies", "baby wipes"])) return result("Baby", "Baby food & care", "high", "explicit baby product");
  if (has(text, ["laundry detergent", "dishwashing", "dishwasher", "toilet paper", "paper towel", "surface cleaner", "bleach", "air freshener", "room spray", "cleaning spray", "garbage bag", "bin liner"])) return result("Household", "Cleaning & household", "high", "explicit household product");
  if (has(text, ["shampoo", "conditioner", "toothpaste", "toothbrush", "deodorant", "body wash", "hand wash", "vitamin", "supplement", "sunscreen"])) return result("Health & personal care", "Health & personal care", "high", "explicit personal-care product");

  if (has(text, ["frozen"])) {
    const shelf = has(text, ["pizza"]) ? "Frozen pizza & bases" : has(text, ["ice cream", "gelato", "sorbet"]) ? "Ice cream & frozen desserts" : has(text, ["vegetable", "peas", "corn", "berries", "fruit"]) ? "Frozen fruit & vegetables" : has(text, ["fish", "seafood", "prawn"]) ? "Frozen fish & seafood" : has(text, ["chicken", "beef", "pork"]) ? "Frozen meat" : "Frozen food";
    return result("Frozen", shelf, "high", "explicit frozen product");
  }
  if (has(text, ["ice cream", "gelato", "sorbet"])) return result("Frozen", "Ice cream & frozen desserts", "high", "frozen dessert identity");

  if (has(text, ["stock", "stock cube", "gravy", "recipe base"])) return result("Pantry", "Stocks, gravy & recipe bases", "high", "shelf-stable cooking base");
  if (has(text, ["canned tuna", "tuna can", "tuna chunks", "tuna slices", "canned salmon", "canned sardine", "sardines", "canned fish"])) return result("Pantry", "Canned food, soups & noodles", "high", "canned seafood is pantry food");
  if (has(text, ["soup", "instant noodle", "cup noodle"])) return result("Pantry", "Canned food, soups & noodles", "high", "shelf-stable soup or noodles");
  if (has(text, ["pasta", "rice", "quinoa", "lentil", "chickpea", "cannellini", "kidney bean", "black bean", "borlotti", "dried bean"])) return result("Pantry", "Pasta, rice, legumes & grains", "high", "pantry staple");
  if (has(text, ["flour", "baking powder", "baking soda", "cake mix", "cocoa", "vanilla essence", "food colouring"])) return result("Pantry", "Baking", "high", "baking product");
  if (has(text, ["salt", "pepper", "cinnamon", "cumin", "paprika", "spice", "herbs", "dried herb"])) return result("Pantry", "Herbs & spices", "high", "seasoning product");
  if (has(text, ["sauce", "pesto", "mayonnaise", "mustard", "ketchup", "relish", "chutney"])) return result("Pantry", "Sauces & condiments", "high", "sauce or condiment");
  if (has(text, ["oil", "vinegar"])) return result("Pantry", "Oils & vinegars", "high", "oil or vinegar");
  if (has(text, ["sugar", "sweetener", "honey", "jam", "spread"])) return result("Pantry", has(text, ["sugar", "sweetener"]) ? "Sugar & sweeteners" : "Jams, honey & spreads", "high", "pantry sweetener or spread");
  if (has(text, ["cereal", "muesli", "granola", "oats", "porridge"])) return result("Pantry", "Breakfast", "high", "breakfast pantry product");

  if (has(text, ["chocolate", "kit kat", "kitkat", "lolly", "lollies", "candy", "confectionery", "choc block", "snack bar"])) return result("Confectionery", "Chocolate & confectionery", "high", "confectionery identity");
  if (has(text, ["biscuit", "cookies", "cookie"])) return result("Confectionery", "Biscuits & cookies", "medium", "snack identity");

  if (has(text, ["soft drink", "cola", "lemonade", "cordial", "energy drink", "sports drink", "iced tea", "juice", "sparkling water", "mineral water"])) return result("Drinks", "Cold drinks", "high", "beverage identity");
  if (has(text, ["iced coffee", "coffee drink", "liquid breakfast"])) return result("Drinks", "Chilled drinks", "high", "ready-to-drink beverage");
  if (has(text, ["coffee beans", "ground coffee", "instant coffee", "coffee capsules", "tea bags", "black tea", "green tea"])) return result("Pantry", has(text, ["tea"]) ? "Tea" : "Coffee", "high", "shelf-stable hot beverage");

  if (has(text, ["fresh milk", "yoghurt", "yogurt", "cheese", "butter", "margarine", "cream", "custard", "egg", "eggs", "feta", "mozzarella"])) return result("Dairy & eggs", has(text, ["egg", "eggs"]) ? "Eggs" : has(text, ["cheese", "feta", "mozzarella"]) ? "Cheese" : has(text, ["yoghurt", "yogurt"]) ? "Yoghurt" : "Milk, cream & dairy", "high", "dairy or egg product");

  if (has(text, ["salami", "prosciutto", "charcuterie", "sliced ham", "deli ham", "antipasto"])) return result("Deli", "Deli meat & antipasto", "high", "deli product");
  if (has(text, ["beef mince", "beef steak", "lamb", "pork chop", "pork mince", "chicken breast", "chicken thigh", "whole chicken", "fresh fish", "fresh salmon", "fresh barramundi", "prawn", "fresh seafood", "turkey breast"])) return result("Meat & seafood", "Fresh meat & seafood", "high", "explicit fresh meat or seafood product");

  if (has(text, ["bread", "bagel", "brioche", "croissant", "bread roll", "flatbread", "pita", "tortilla", "wrap"])) return result("Bakery", "Bread & bakery", "high", "bakery product");

  if (has(text, ["apple", "apricot", "asparagus", "avocado", "banana", "beetroot", "broccoli", "broccolini", "cabbage", "capsicum", "carrot", "cauliflower", "celery", "cucumber", "eggplant", "garlic", "ginger", "grape", "kale", "leek", "lemon", "lettuce", "lime", "mandarin", "mango", "mushroom", "nectarine", "onion", "orange", "pear", "potato", "pumpkin", "radish", "spinach", "strawberry", "sweet potato", "tomato", "watermelon", "zucchini"])) return result("Fruit & vegetables", "Fresh fruit & vegetables", "medium", "produce name fallback");

  if (has(text, ["water", "drink", "juice"])) return result("Drinks", "Drinks", "medium", "generic beverage fallback");
  return result("Other", null, "low", "no sufficiently specific rule matched");
}

function departmentFromText(value: string) {
  const normalised = normaliseProductText(value);
  if (!normalised) return null;
  return departmentAliases.get(normalised) ?? classifyProductText(normalised).department;
}

export function inferProductCategory(value: string) {
  const classification = classifyProductText(value);
  return classification.department === "Other" ? null : classification.department;
}

export function productDepartment(category: string | null | undefined, productName: string): SupermarketDepartment {
  const stored = canonicalDepartments.get(normaliseProductText(category ?? ""));
  const inferred = classifyProductText(productName);

  // Specific high-confidence identity beats legacy Pantry/Other assignments. This
  // repairs historical imports such as dog food containing "beef" or canned tuna.
  if ((!stored || stored === "Pantry") && inferred.confidence === "high" && inferred.department !== "Other") return inferred.department;
  if (stored) return stored;

  const categoryDepartment = departmentFromText(category ?? "");
  if (categoryDepartment && categoryDepartment !== "Other") return categoryDepartment;
  return inferred.department;
}
