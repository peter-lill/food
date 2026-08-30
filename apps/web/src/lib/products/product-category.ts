import { normaliseProductText } from "./product-normalisation";
import { guardedProductIdentity } from "./product-taxonomy-guards";

/** Canonical retail-wide product departments. Retailer-specific aisles/categories
 * are evidence for these departments; they are not the canonical taxonomy. */
export const productDepartments = [
  "Fruit & vegetables", "Bakery", "Meat & seafood", "Deli", "Dairy & eggs", "Frozen", "Pantry",
  "Confectionery", "Drinks", "Beer, wine & spirits", "Health & personal care", "Household", "Baby", "Pet",
  "Home, kitchen & appliances", "Electronics & technology", "Garden & outdoor", "Automotive", "Tools & hardware",
  "Office & stationery", "Clothing, footwear & accessories", "Sport, fitness & recreation", "Toys, games & entertainment",
  "Furniture & homewares", "Seasonal", "General merchandise", "Other",
] as const;
export type ProductDepartment = (typeof productDepartments)[number];

// Compatibility exports while callers migrate away from supermarket terminology.
export const supermarketDepartments = productDepartments;
export type SupermarketDepartment = ProductDepartment;

export type ProductClassification = {
  department: ProductDepartment;
  shelf: string | null;
  confidence: "authoritative" | "high" | "medium" | "low";
  reason: string;
};

export type ProductClassificationInput = {
  name: string;
  storedCategory?: string | null;
  retailer?: string | null;
  retailerCategoryPath?: string | null;
  aisle?: string | null;
  productType?: string | null;
};

const departmentAliases = new Map<string, ProductDepartment>([
  ["fresh produce", "Fruit & vegetables"], ["produce", "Fruit & vegetables"], ["fruit and vegetables", "Fruit & vegetables"], ["fruit vegetables", "Fruit & vegetables"],
  ["fresh meat", "Meat & seafood"], ["seafood", "Meat & seafood"], ["meat and seafood", "Meat & seafood"], ["meat seafood", "Meat & seafood"],
  ["dairy eggs and fridge", "Dairy & eggs"], ["dairy eggs fridge", "Dairy & eggs"], ["dairy and eggs", "Dairy & eggs"], ["dairy eggs", "Dairy & eggs"], ["chilled", "Dairy & eggs"],
  ["freezer", "Frozen"], ["international", "Pantry"], ["international foods", "Pantry"], ["salt", "Pantry"], ["salts", "Pantry"], ["herbs and spices", "Pantry"],
  ["alcoholic beverage", "Beer, wine & spirits"], ["alcoholic beverages", "Beer, wine & spirits"], ["liquor", "Beer, wine & spirits"], ["beer wine spirits", "Beer, wine & spirits"],
  ["snacks and confectionery", "Confectionery"], ["snacks confectionery", "Confectionery"], ["health and beauty", "Health & personal care"], ["health beauty", "Health & personal care"],
  ["cleaning and household", "Household"], ["cleaning household", "Household"], ["pets", "Pet"], ["home appliances", "Home, kitchen & appliances"],
  ["electronics", "Electronics & technology"], ["technology", "Electronics & technology"], ["garden", "Garden & outdoor"], ["outdoor", "Garden & outdoor"],
  ["auto", "Automotive"], ["car care", "Automotive"], ["hardware", "Tools & hardware"], ["tools", "Tools & hardware"], ["stationery", "Office & stationery"],
  ["clothing", "Clothing, footwear & accessories"], ["apparel", "Clothing, footwear & accessories"], ["sport", "Sport, fitness & recreation"], ["fitness", "Sport, fitness & recreation"],
  ["toys", "Toys, games & entertainment"], ["games", "Toys, games & entertainment"], ["furniture", "Furniture & homewares"], ["homewares", "Furniture & homewares"],
]);
for (const department of productDepartments) departmentAliases.set(normaliseProductText(department), department);

const canonicalDepartments = new Map<string, Exclude<ProductDepartment, "Other">>(
  productDepartments.filter((d): d is Exclude<ProductDepartment, "Other"> => d !== "Other").map((d) => [normaliseProductText(d), d]),
);

const has = (text: string, terms: string[]) => terms.some((term) => new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+")}\\b`, "i").test(text));
const result = (department: ProductDepartment, shelf: string | null, confidence: ProductClassification["confidence"], reason: string): ProductClassification => ({ department, shelf, confidence, reason });

export function classifyProductText(value: string): ProductClassification {
  const text = normaliseProductText(value);
  if (!text) return result("Other", null, "low", "no usable classification text");

  const guarded = guardedProductIdentity(text);
  if (guarded) return guarded;

  // Retail-wide non-grocery identities. These precede ingredient-like words so
  // products such as sugar-cane mulch are not mistaken for food.
  if (has(text, ["mulch", "potting mix", "garden soil", "fertiliser", "fertilizer", "weed killer", "garden hose", "plant pot", "planter", "outdoor setting", "bbq", "barbecue"])) return result("Garden & outdoor", "Garden & outdoor", "high", "garden/outdoor product identity");
  if (has(text, ["television", "smart tv", "tablet computer", "laptop", "powerbank", "power bank", "usb charger", "phone charger", "headphones", "earbuds", "bluetooth speaker", "wifi router", "wi-fi router"])) return result("Electronics & technology", "Electronics & technology", "high", "electronics product identity");
  if (has(text, ["microwave oven", "air fryer", "slow cooker", "pressure cooker", "coffee machine", "kettle", "toaster", "blender", "vacuum cleaner", "fridge", "refrigerator", "washing machine", "dryer"])) return result("Home, kitchen & appliances", "Appliances", "high", "appliance product identity");
  if (has(text, ["sofa", "couch", "mattress", "bed frame", "dining table", "bookshelf", "bookcase", "bedside table", "bar stool", "office chair"])) return result("Furniture & homewares", "Furniture", "high", "furniture product identity");
  if (has(text, ["socket set", "screwdriver", "drill bit", "power drill", "tool box", "toolbox", "workshop trolley", "spanner", "wrench", "hammer"])) return result("Tools & hardware", "Tools & hardware", "high", "tool/hardware product identity");
  if (has(text, ["engine oil", "motor oil", "car battery", "windscreen wiper", "windshield wiper", "tyre", "tire", "car polish", "car wash", "coolant"])) return result("Automotive", "Automotive", "high", "automotive product identity");
  if (has(text, ["printer paper", "copy paper", "notebook", "exercise book", "ballpoint pen", "marker pen", "stapler", "printer ink", "toner cartridge"])) return result("Office & stationery", "Office & stationery", "high", "office/stationery product identity");
  if (has(text, ["t shirt", "t-shirt", "shirt", "hoodie", "jacket", "jeans", "socks", "underwear", "sneakers", "running shoes", "slippers"])) return result("Clothing, footwear & accessories", "Clothing & footwear", "high", "apparel product identity");
  if (has(text, ["dumbbell", "kettlebell", "yoga mat", "treadmill", "exercise bike", "basketball", "football", "soccer ball", "tennis racquet", "tennis racket", "golf club"])) return result("Sport, fitness & recreation", "Sport & fitness", "high", "sport/fitness product identity");
  if (has(text, ["lego", "building blocks", "board game", "jigsaw puzzle", "toy car", "action figure", "doll", "plush toy", "video game"])) return result("Toys, games & entertainment", "Toys & games", "high", "toy/game product identity");

  if (has(text, ["air wick", "air freshener", "diffuser", "automatic spray refill", "room spray", "surface cleaner", "laundry detergent", "dishwashing", "dishwasher", "toilet paper", "paper towel", "bleach", "garbage bag", "bin liner", "cling wrap", "aluminium foil", "baking paper"])) return result("Household", "Cleaning & household", "high", "explicit household product");
  if (has(text, ["shampoo", "conditioner", "toothpaste", "toothbrush", "deodorant", "body wash", "hand wash", "hair oil", "body oil", "vitamin", "supplement", "sunscreen"])) return result("Health & personal care", "Health & personal care", "high", "explicit personal-care product");
  if (has(text, ["dog food", "cat food", "pet food", "dog treat", "cat treat", "pet treat", "dog biscuit", "cat litter", "dog litter"])) return result("Pet", has(text, ["dog"]) ? "Dog food & care" : has(text, ["cat"]) ? "Cat food & care" : "Pet food & care", "high", "explicit pet product");
  if (has(text, ["baby formula", "infant formula", "toddler formula", "baby food", "baby puree", "baby snack", "toddler snack", "baby rice rusk", "baby rice puff", "nappy", "nappies", "baby wipes"])) return result("Baby", "Baby food & care", "high", "explicit baby product");

  // Alcoholic identity is distinct from ordinary drinks. Low/no-alcohol adult
  // beverages remain Drinks unless the text explicitly describes alcohol.
  if (has(text, ["beer", "lager", "pale ale", "ipa", "stout", "cider", "red wine", "white wine", "sparkling wine", "champagne", "prosecco", "shiraz", "cabernet", "sauvignon blanc", "chardonnay", "pinot noir", "vodka", "whisky", "whiskey", "bourbon", "tequila", "rum", "liqueur", "gin", "premix", "ready to drink alcohol", "rtd alcohol"]) && !has(text, ["non alcoholic", "non-alcoholic", "alcohol free", "0.0%", "zero alcohol"])) {
    const shelf = has(text, ["beer", "lager", "ale", "ipa", "stout"]) ? "Beer" : has(text, ["cider"]) ? "Cider" : has(text, ["wine", "champagne", "prosecco", "shiraz", "cabernet", "sauvignon blanc", "chardonnay", "pinot noir"]) ? "Wine" : has(text, ["premix", "ready to drink", "rtd"]) ? "Premix & RTD" : "Spirits";
    return result("Beer, wine & spirits", shelf, "high", "alcoholic beverage identity");
  }
  if (has(text, ["non alcoholic", "non-alcoholic", "alcohol free", "0.0%", "zero alcohol"]) && has(text, ["beer", "wine", "gin", "spirit", "cocktail", "g&t"])) return result("Drinks", "Low & no alcohol adult drinks", "high", "non-alcoholic adult beverage identity");

  if (has(text, ["frozen"])) {
    const shelf = has(text, ["pizza"]) ? "Frozen pizza & bases" : has(text, ["ice cream", "gelato", "sorbet"]) ? "Ice cream & frozen desserts" : has(text, ["vegetable", "peas", "corn", "berries", "fruit"]) ? "Frozen fruit & vegetables" : has(text, ["fish", "seafood", "prawn"]) ? "Frozen fish & seafood" : has(text, ["chicken", "beef", "pork"]) ? "Frozen meat" : "Frozen food";
    return result("Frozen", shelf, "high", "explicit frozen product");
  }
  if (has(text, ["ice cream", "gelato", "sorbet", "ice blocks"])) return result("Frozen", "Ice cream & frozen desserts", "high", "frozen dessert identity");

  if (has(text, ["beef mince", "beef steak", "beef brisket", "beef roast", "lamb chop", "lamb leg", "lamb mince", "pork chop", "pork mince", "pork shoulder", "chicken breast", "chicken thigh", "chicken drumstick", "chicken wing", "whole chicken", "chicken burger", "fresh fish", "fresh salmon", "salmon fillet", "barramundi fillet", "fish fillet", "prawn", "fresh seafood", "turkey breast", "meatball"]) && !has(text, ["stock", "recipe base", "soup", "instant noodle", "cup noodle", "dog food", "cat food", "sauce"])) return result("Meat & seafood", "Fresh meat & seafood", "high", "explicit fresh meat or seafood product");
  if (has(text, ["salami", "prosciutto", "charcuterie", "sliced ham", "deli ham", "mortadella", "pate", "antipasto"])) return result("Deli", "Deli meat & antipasto", "high", "deli product");

  if (has(text, ["peanut butter", "almond butter", "cashew butter", "nut butter"])) return result("Pantry", "Jams, honey & spreads", "high", "nut spread identity");
  if (has(text, ["coconut cream", "coconut milk"])) return result("Pantry", "Canned food, soups & noodles", "high", "shelf-stable coconut product");
  if (has(text, ["cream of tartar", "egg replacer"])) return result("Pantry", "Baking", "high", "baking ingredient identity");
  if (has(text, ["stock", "stock cube", "stock powder", "gravy", "recipe base"])) return result("Pantry", "Stocks, gravy & recipe bases", "high", "shelf-stable cooking base");
  if (has(text, ["tuna", "sardine", "sardines", "mackerel", "anchovy", "anchovies", "canned salmon"]) && (has(text, ["can", "canned", "tin", "chunks", "slices", "in oil", "in sauce"]) || /\b(?:50|90|95|105|125|185|400|425)g\b/.test(text))) return result("Pantry", "Canned food, soups & noodles", "high", "shelf-stable canned seafood");
  if (has(text, ["soup", "instant noodle", "cup noodle", "ramen noodle"])) return result("Pantry", "Canned food, soups & noodles", "high", "shelf-stable soup or noodles");
  if (has(text, ["baked beans", "canned beans"])) return result("Pantry", "Canned food, soups & noodles", "high", "canned pantry food");
  if (has(text, ["pasta sauce"])) return result("Pantry", "Sauces & condiments", "high", "pasta sauce identity");
  if (has(text, ["pasta", "rice", "quinoa", "lentil", "chickpea", "cannellini", "kidney bean", "black bean", "borlotti", "dried bean"])) return result("Pantry", "Pasta, rice, legumes & grains", "high", "pantry staple");
  if (has(text, ["bread mix", "muffin mix", "brownie mix", "cookie mix", "cake mix", "flour", "baking powder", "baking soda", "cocoa", "vanilla essence", "food colouring"])) return result("Pantry", "Baking", "high", "baking product");
  if (has(text, ["cracker", "crackers", "cracker chips", "rice crackers", "chips", "crisps"])) return result("Pantry", "Snacks", "high", "savoury snack identity");
  if (has(text, ["sauce", "pesto", "mayonnaise", "mustard", "ketchup", "relish", "chutney", "marinade"])) return result("Pantry", "Sauces & condiments", "high", "sauce or condiment");
  if (has(text, ["olive oil", "vegetable oil", "canola oil", "sunflower oil", "rice bran oil", "sesame oil", "cooking oil", "vinegar", "apple cider vinegar"])) return result("Pantry", "Oils & vinegars", "high", "culinary oil or vinegar");
  if (has(text, ["honey", "jam", "peanut spread", "almond spread", "hazelnut spread"])) return result("Pantry", "Jams, honey & spreads", "high", "pantry spread identity");
  if (has(text, ["sugar", "sweetener"]) && !has(text, ["no sugar", "sugar free", "less sugar", "reduced sugar", "no added sugar", "low sugar"])) return result("Pantry", "Sugar & sweeteners", "high", "sweetener identity");
  if (has(text, ["cereal", "muesli", "granola", "oats", "porridge"])) return result("Pantry", "Breakfast", "high", "breakfast pantry product");
  if (has(text, ["salt", "pepper", "cinnamon", "cumin", "paprika", "spice", "herbs", "dried herb"]) && !has(text, ["muffin", "cake", "scroll", "cracker", "chips", "crisps", "chicken", "salmon", "tuna", "fish", "pate", "air wick", "diffuser", "soap"])) return result("Pantry", "Herbs & spices", "high", "seasoning product");

  if (has(text, ["chocolate block", "choc block", "kit kat", "kitkat", "lolly", "lollies", "candy", "confectionery", "chocolate bar", "snack bar"])) return result("Confectionery", "Chocolate & confectionery", "high", "confectionery identity");
  if (has(text, ["biscuit", "cookies", "cookie"]) && !has(text, ["baby", "toddler"])) return result("Confectionery", "Biscuits & cookies", "medium", "snack identity");

  if (has(text, ["soft drink", "cola", "lemonade", "cordial", "energy drink", "sports drink", "iced tea", "juice", "sparkling water", "mineral water"])) return result("Drinks", "Cold drinks", "high", "beverage identity");
  if (has(text, ["iced coffee", "coffee drink", "liquid breakfast"])) return result("Drinks", "Chilled drinks", "high", "ready-to-drink beverage");
  if (has(text, ["coffee beans", "ground coffee", "instant coffee", "coffee capsules", "tea bags", "black tea", "green tea"])) return result("Pantry", has(text, ["tea"]) ? "Tea" : "Coffee", "high", "shelf-stable hot beverage");

  if (has(text, ["fresh milk", "full cream milk", "skim milk", "low fat milk", "uht milk", "long life milk", "dairy milk", "yoghurt", "yogurt", "cheddar", "mozzarella", "feta", "parmesan", "cream cheese", "sour cream", "whipping cream", "thickened cream", "dairy cream", "custard", "free range eggs", "cage eggs", "dozen eggs", "margarine"])) {
    const shelf = has(text, ["eggs"]) ? "Eggs" : has(text, ["cheddar", "mozzarella", "feta", "parmesan", "cream cheese"]) ? "Cheese" : has(text, ["yoghurt", "yogurt"]) ? "Yoghurt" : "Milk, cream & dairy";
    return result("Dairy & eggs", shelf, "high", "explicit dairy or egg product");
  }
  if (has(text, ["bread", "bagel", "brioche", "croissant", "bread roll", "flatbread", "pita", "tortilla", "wrap"]) && !has(text, ["mix", "improver", "crumb", "cracker", "chips"])) return result("Bakery", "Bread & bakery", "high", "bakery product");
  if (has(text, ["apple", "apricot", "asparagus", "avocado", "banana", "beetroot", "broccoli", "broccolini", "cabbage", "capsicum", "carrot", "cauliflower", "celery", "cucumber", "eggplant", "garlic", "ginger", "grape", "kale", "leek", "lemon", "lettuce", "lime", "mandarin", "mango", "mushroom", "nectarine", "onion", "orange", "pear", "potato", "pumpkin", "radish", "spinach", "strawberry", "sweet potato", "tomato", "watermelon", "zucchini"])) return result("Fruit & vegetables", "Fresh fruit & vegetables", "medium", "produce name fallback");
  if (has(text, ["water", "drink", "juice"])) return result("Drinks", "Drinks", "medium", "generic beverage fallback");
  return result("Other", null, "low", "no sufficiently specific rule matched");
}

/** Structured classifier. Retailer taxonomy is evaluated independently from the
 * product name so aisle words cannot contaminate identity matching. */
export function classifyProduct(input: ProductClassificationInput): ProductClassification {
  const retailerPath = normaliseProductText(input.retailerCategoryPath ?? input.aisle ?? "");
  if (retailerPath) {
    const exact = departmentAliases.get(retailerPath);
    if (exact && exact !== "Other") return result(exact, input.retailerCategoryPath ?? input.aisle ?? null, "authoritative", "retailer taxonomy mapping");
    for (const [alias, department] of departmentAliases) {
      if (alias.length >= 4 && new RegExp(`(?:^|\\s)${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s|$)`, "i").test(retailerPath) && department !== "Other") return result(department, input.retailerCategoryPath ?? input.aisle ?? null, "authoritative", "retailer taxonomy mapping");
    }
  }
  const identity = classifyProductText([input.name, input.productType].filter(Boolean).join(" "));
  if (identity.department !== "Other") return identity;
  const stored = canonicalDepartments.get(normaliseProductText(input.storedCategory ?? ""));
  if (stored) return result(stored, null, "authoritative", "stored canonical department");
  return identity;
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

export function productDepartment(category: string | null | undefined, productName: string): ProductDepartment {
  const stored = canonicalDepartments.get(normaliseProductText(category ?? ""));
  const inferred = classifyProductText(productName);
  if ((!stored || stored === "Pantry") && inferred.confidence === "high" && inferred.department !== "Other") return inferred.department;
  if (stored) return stored;
  const categoryDepartment = departmentFromText(category ?? "");
  if (categoryDepartment && categoryDepartment !== "Other") return categoryDepartment;
  return inferred.department;
}
