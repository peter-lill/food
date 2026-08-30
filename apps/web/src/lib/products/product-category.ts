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

/** Shared fallback classifier for imports without trustworthy retailer taxonomy.
 * Product identity is resolved before flavour/ingredient/modifier words. Broad
 * terms such as oil, salt, honey, cream and butter must never outrank the thing
 * actually being sold.
 */
export function classifyProductText(value: string): ProductClassification {
  const text = normaliseProductText(value);
  if (!text) return result("Other", null, "low", "no usable classification text");

  // Non-food identity has first priority so fragrance/ingredient words cannot
  // turn household and personal-care products into pantry products.
  if (has(text, ["air wick", "air freshener", "diffuser", "automatic spray refill", "room spray", "surface cleaner", "laundry detergent", "dishwashing", "dishwasher", "toilet paper", "paper towel", "bleach", "garbage bag", "bin liner", "cling wrap", "aluminium foil", "baking paper"])) return result("Household", "Cleaning & household", "high", "explicit household product");
  if (has(text, ["shampoo", "conditioner", "toothpaste", "toothbrush", "deodorant", "body wash", "hand wash", "hair oil", "body oil", "vitamin", "supplement", "sunscreen"])) return result("Health & personal care", "Health & personal care", "high", "explicit personal-care product");
  if (has(text, ["dog food", "cat food", "pet food", "dog treat", "cat treat", "pet treat", "dog biscuit", "cat litter", "dog litter"])) return result("Pet", has(text, ["dog"]) ? "Dog food & care" : has(text, ["cat"]) ? "Cat food & care" : "Pet food & care", "high", "explicit pet product");
  if (has(text, ["baby formula", "infant formula", "toddler formula", "baby food", "baby puree", "baby snack", "toddler snack", "baby rice rusk", "baby rice puff", "rice rusk 8 months", "rice rusk 12 months", "nappy", "nappies", "baby wipes"])) return result("Baby", "Baby food & care", "high", "explicit baby product");

  // Frozen identity wins over ingredients contained in the product name.
  if (has(text, ["frozen"])) {
    const shelf = has(text, ["pizza"]) ? "Frozen pizza & bases" : has(text, ["ice cream", "gelato", "sorbet"]) ? "Ice cream & frozen desserts" : has(text, ["vegetable", "peas", "corn", "berries", "fruit"]) ? "Frozen fruit & vegetables" : has(text, ["fish", "seafood", "prawn"]) ? "Frozen fish & seafood" : has(text, ["chicken", "beef", "pork"]) ? "Frozen meat" : "Frozen food";
    return result("Frozen", shelf, "high", "explicit frozen product");
  }
  if (has(text, ["ice cream", "gelato", "sorbet", "ice blocks"])) return result("Frozen", "Ice cream & frozen desserts", "high", "frozen dessert identity");

  // Fresh meat and deli identity outrank marinades, herbs, honey, sauces etc.
  if (has(text, ["beef mince", "beef steak", "beef brisket", "beef roast", "lamb chop", "lamb leg", "lamb mince", "pork chop", "pork mince", "pork shoulder", "chicken breast", "chicken thigh", "chicken drumstick", "chicken wing", "whole chicken", "chicken burger", "fresh fish", "fresh salmon", "salmon fillet", "barramundi fillet", "fish fillet", "prawn", "fresh seafood", "turkey breast", "meatball"])
      && !has(text, ["stock", "recipe base", "soup", "instant noodle", "cup noodle", "dog food", "cat food"])) return result("Meat & seafood", "Fresh meat & seafood", "high", "explicit fresh meat or seafood product");
  if (has(text, ["salami", "prosciutto", "charcuterie", "sliced ham", "deli ham", "mortadella", "pate", "antipasto"])) return result("Deli", "Deli meat & antipasto", "high", "deli product");

  // Pantry product identities that commonly contain misleading ingredient words.
  if (has(text, ["peanut butter", "almond butter", "cashew butter", "nut butter"])) return result("Pantry", "Jams, honey & spreads", "high", "nut spread identity");
  if (has(text, ["coconut cream", "coconut milk"])) return result("Pantry", "Canned food, soups & noodles", "high", "shelf-stable coconut product");
  if (has(text, ["cream of tartar", "egg replacer"])) return result("Pantry", "Baking", "high", "baking ingredient identity");
  if (has(text, ["stock", "stock cube", "stock powder", "gravy", "recipe base"])) return result("Pantry", "Stocks, gravy & recipe bases", "high", "shelf-stable cooking base");
  if (has(text, ["tuna", "sardine", "sardines", "mackerel", "anchovy", "anchovies", "canned salmon"]) && has(text, ["can", "canned", "tin", "chunks", "slices", "in oil", "in sauce", "95g", "185g", "425g"])) return result("Pantry", "Canned food, soups & noodles", "high", "shelf-stable canned seafood");
  if (has(text, ["soup", "instant noodle", "cup noodle", "ramen noodle"])) return result("Pantry", "Canned food, soups & noodles", "high", "shelf-stable soup or noodles");
  if (has(text, ["baked beans", "canned beans"])) return result("Pantry", "Canned food, soups & noodles", "high", "canned pantry food");
  if (has(text, ["pasta sauce"])) return result("Pantry", "Sauces & condiments", "high", "pasta sauce identity");
  if (has(text, ["pasta", "rice", "quinoa", "lentil", "chickpea", "cannellini", "kidney bean", "black bean", "borlotti", "dried bean"])) return result("Pantry", "Pasta, rice, legumes & grains", "high", "pantry staple");
  if (has(text, ["bread mix", "muffin mix", "brownie mix", "cookie mix", "cake mix", "flour", "baking powder", "baking soda", "cocoa", "vanilla essence", "food colouring"])) return result("Pantry", "Baking", "high", "baking product");
  if (has(text, ["cracker", "crackers", "cracker chips", "rice crackers", "chips", "crisps"])) return result("Pantry", "Snacks", "high", "savoury snack identity");
  if (has(text, ["sauce", "pesto", "mayonnaise", "mustard", "ketchup", "relish", "chutney", "marinade"])) return result("Pantry", "Sauces & condiments", "high", "sauce or condiment");
  if (has(text, ["olive oil", "vegetable oil", "canola oil", "sunflower oil", "rice bran oil", "sesame oil", "cooking oil", "vinegar", "apple cider vinegar"])) return result("Pantry", "Oils & vinegars", "high", "culinary oil or vinegar");
  if (has(text, ["honey", "jam", "peanut spread", "almond spread", "hazelnut spread"])) return result("Pantry", "Jams, honey & spreads", "high", "pantry spread identity");
  if (has(text, ["sugar", "sweetener"]) && !has(text, ["no sugar", "sugar free", "less sugar", "reduced sugar", "no added sugar"])) return result("Pantry", "Sugar & sweeteners", "high", "sweetener identity");
  if (has(text, ["cereal", "muesli", "granola", "oats", "porridge"])) return result("Pantry", "Breakfast", "high", "breakfast pantry product");
  if (has(text, ["salt", "pepper", "cinnamon", "cumin", "paprika", "spice", "herbs", "dried herb"]) && !has(text, ["muffin", "cake", "scroll", "cracker", "chips", "crisps", "chicken", "salmon", "tuna", "fish", "pate", "air wick", "diffuser"])) return result("Pantry", "Herbs & spices", "high", "seasoning product");

  if (has(text, ["chocolate block", "choc block", "kit kat", "kitkat", "lolly", "lollies", "candy", "confectionery", "chocolate bar", "snack bar"])) return result("Confectionery", "Chocolate & confectionery", "high", "confectionery identity");
  if (has(text, ["biscuit", "cookies", "cookie"]) && !has(text, ["baby", "toddler"])) return result("Confectionery", "Biscuits & cookies", "medium", "snack identity");

  if (has(text, ["soft drink", "cola", "lemonade", "cordial", "energy drink", "sports drink", "iced tea", "juice", "sparkling water", "mineral water"])) return result("Drinks", "Cold drinks", "high", "beverage identity");
  if (has(text, ["iced coffee", "coffee drink", "liquid breakfast"])) return result("Drinks", "Chilled drinks", "high", "ready-to-drink beverage");
  if (has(text, ["coffee beans", "ground coffee", "instant coffee", "coffee capsules", "tea bags", "black tea", "green tea"])) return result("Pantry", has(text, ["tea"]) ? "Tea" : "Coffee", "high", "shelf-stable hot beverage");

  // Dairy only on explicit dairy identities. Bare butter/cream/egg are too broad.
  if (has(text, ["fresh milk", "full cream milk", "skim milk", "low fat milk", "uht milk", "long life milk", "dairy milk", "yoghurt", "yogurt", "cheddar", "mozzarella", "feta", "parmesan", "cream cheese", "sour cream", "whipping cream", "thickened cream", "dairy cream", "custard", "free range eggs", "cage eggs", "dozen eggs", "margarine"])) {
    const shelf = has(text, ["eggs"]) ? "Eggs" : has(text, ["cheddar", "mozzarella", "feta", "parmesan", "cream cheese"]) ? "Cheese" : has(text, ["yoghurt", "yogurt"]) ? "Yoghurt" : "Milk, cream & dairy";
    return result("Dairy & eggs", shelf, "high", "explicit dairy or egg product");
  }

  if (has(text, ["bread", "bagel", "brioche", "croissant", "bread roll", "flatbread", "pita", "tortilla", "wrap"]) && !has(text, ["mix", "improver", "crumb", "cracker", "chips"])) return result("Bakery", "Bread & bakery", "high", "bakery product");

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
  if ((!stored || stored === "Pantry") && inferred.confidence === "high" && inferred.department !== "Other") return inferred.department;
  if (stored) return stored;
  const categoryDepartment = departmentFromText(category ?? "");
  if (categoryDepartment && categoryDepartment !== "Other") return categoryDepartment;
  return inferred.department;
}
