import { normaliseProductText } from "./product-normalisation";

export const supermarketDepartments = [
  "Fruit & vegetables",
  "Bakery",
  "Meat & seafood",
  "Deli",
  "Dairy & eggs",
  "Frozen",
  "Pantry",
  "Confectionery",
  "Drinks",
  "Health & personal care",
  "Household",
  "Baby",
  "Pet",
  "Other",
] as const;

export type SupermarketDepartment = (typeof supermarketDepartments)[number];

const departmentAliases = new Map<string, SupermarketDepartment>([
  ["fresh produce", "Fruit & vegetables"],
  ["produce", "Fruit & vegetables"],
  ["fruit veg", "Fruit & vegetables"],
  ["fruit and veg", "Fruit & vegetables"],
  ["fruit and vegetables", "Fruit & vegetables"],
  ["fruit vegetables", "Fruit & vegetables"],
  ["fresh meat", "Meat & seafood"],
  ["meat", "Meat & seafood"],
  ["deli meat", "Deli"],
  ["deli seafood", "Deli"],
  ["deli chilled meats", "Deli"],
  ["bread bakery", "Bakery"],
  ["seafood", "Meat & seafood"],
  ["meat and seafood", "Meat & seafood"],
  ["meat seafood", "Meat & seafood"],
  ["dairy eggs and fridge", "Dairy & eggs"],
  ["dairy eggs fridge", "Dairy & eggs"],
  ["dairy and eggs", "Dairy & eggs"],
  ["dairy eggs", "Dairy & eggs"],
  ["dairy", "Dairy & eggs"],
  ["milk", "Dairy & eggs"],
  ["chilled", "Dairy & eggs"],
  ["freezer", "Frozen"],
  ["frozen food", "Frozen"],
  ["international", "Pantry"],
  ["international foods", "Pantry"],
  ["salt", "Pantry"],
  ["salts", "Pantry"],
  ["herbs and spices", "Pantry"],
  ["alcoholic beverage", "Drinks"],
  ["alcoholic beverages", "Drinks"],
  ["liquor", "Drinks"],
  ["snacks and confectionery", "Confectionery"],
  ["snacks confectionery", "Confectionery"],
  ["confectionery snacks", "Confectionery"],
  ["health and beauty", "Health & personal care"],
  ["health beauty", "Health & personal care"],
  ["cleaning and household", "Household"],
  ["cleaning household", "Household"],
  ["household cleaning needs", "Household"],
  ["petcare", "Pet"],
  ["beer", "Drinks"],
  ["pets", "Pet"],
]);

for (const department of supermarketDepartments) {
  departmentAliases.set(normaliseProductText(department), department);
}

const canonicalDepartments = new Map<
  string,
  Exclude<SupermarketDepartment, "Other">
>(
  supermarketDepartments
    .filter((department): department is Exclude<SupermarketDepartment, "Other"> => department !== "Other")
    .map((department) => [normaliseProductText(department), department]),
);

const departmentRules: Array<{ department: SupermarketDepartment; terms: string[] }> = [
  {
    department: "Confectionery",
    terms: ["chocolate", "kit kat", "kitkat"],
  },
  {
    department: "Pantry",
    terms: [
      "basil pesto", "black bean", "black beans", "borlotti bean", "borlotti beans",
      "butter bean", "butter beans", "canned bean", "canned beans", "cannellini bean",
      "cannellini beans", "dried bean", "dried beans", "kidney bean", "kidney beans", "pesto",
    ],
  },
  {
    // These household products contain food words, so they must take
    // precedence over the broad pantry/drinks terms below.
    department: "Household",
    terms: ["kitchen towel", "kitchen towels", "tea towel", "tea towels"],
  },
  {
    department: "Drinks",
    terms: [
      "cola", "cordial", "drink", "energy drink", "hard rated", "iced tea", "juice",
      "lemonade", "mineral water", "soft drink", "sparkling water", "sports drink", "water",
    ],
  },
  {
    department: "Fruit & vegetables",
    terms: [
      "apple", "apricot", "asparagus", "avocado", "banana", "basil", "bean sprouts",
      "beetroot", "broad bean", "broad beans", "broccoli", "broccolini", "cabbage", "capsicum",
      "carrot", "cauliflower", "celery", "chilli", "chives", "coriander", "corn", "cucumber",
      "dill", "edamame", "eggplant", "french bean", "french beans", "garlic", "ginger", "grape",
      "green bean", "green beans", "herb", "kale", "kiwifruit", "leek", "lemon", "lettuce", "lime",
      "mandarin", "mango", "mint", "mushroom", "nectarine", "onion", "orange",
      "oregano", "parsley", "pea", "peas", "pear", "potato", "pumpkin", "radish", "rosemary",
      "sage", "salad", "spinach", "spring onion", "strawberry", "sweet potato", "thyme",
      "rocket", "tomato", "watermelon", "zucchini",
    ],
  },
  {
    department: "Meat & seafood",
    terms: [
      "barramundi", "beef", "chicken", "fish", "lamb", "mince", "pork",
      "prawn", "salmon", "sardine", "steak", "trout", "tuna", "turkey",
    ],
  },
  {
    department: "Deli",
    terms: ["antipasto", "bacon", "charcuterie", "ham", "prosciutto", "salami", "sliced meat"],
  },
  {
    department: "Dairy & eggs",
    terms: ["butter", "cheese", "cream", "egg", "eggs", "feta", "fresh milk", "margarine", "mozzarella", "table spread", "yoghurt", "yogurt"],
  },
  {
    department: "Bakery",
    terms: ["bagel", "bread", "brioche", "bun", "croissant", "flatbread", "pita", "roll", "toast", "tortilla", "tortillas", "wrap"],
  },
  {
    department: "Frozen",
    terms: ["frozen", "ice cream"],
  },
  {
    department: "Confectionery",
    terms: ["biscuit", "candy", "confectionery", "lollies", "lolly", "snack bar"],
  },
  {
    department: "Baby",
    terms: ["baby food", "baby formula", "nappies", "nappy"],
  },
  {
    department: "Pet",
    terms: ["cat food", "dog food", "pet food", "pet treat"],
  },
  {
    department: "Health & personal care",
    terms: ["deodorant", "shampoo", "soap", "toothbrush", "toothpaste", "vitamin"],
  },
  {
    department: "Household",
    terms: ["cleaner", "cleaning", "detergent", "dishwashing", "laundry", "paper towel", "toilet paper"],
  },
  {
    department: "Pantry",
    terms: [
      "allspice", "baking powder", "bean", "beans", "cereal", "chickpea", "cinnamon", "coffee", "cumin",
      "flour", "honey", "lentil", "noodle", "nut", "nuts", "oats", "oil", "pasta",
      "pepper", "pesto", "quinoa", "rice", "salt", "sauce", "seed", "seeds", "spice",
      "stock", "sugar", "tea", "vinegar",
    ],
  },
];

function departmentFromText(value: string) {
  const normalised = normaliseProductText(value);
  if (!normalised) return null;

  const alias = departmentAliases.get(normalised);
  if (alias) return alias;

  const rule = departmentRules.find(({ terms }) => terms.some((term) => {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
    return new RegExp(`\\b${escaped}\\b`, "i").test(normalised);
  }));
  return rule?.department ?? null;
}

function nameHasExplicitBabyDepartment(value: string) {
  const normalised = normaliseProductText(value);
  return /\b(?:baby\s+(?:food|formula|snack|snacks|meal|meals|puree|purees)|infant\s+formula|toddler\s+(?:food|snack|snacks|meal|meals)|napp(?:y|ies))\b/i.test(normalised);
}

export function inferProductCategory(value: string) {
  return departmentFromText(value);
}

/**
 * Retailer catalogue paths are category evidence, unlike a product title.
 * Resolve only an explicit path segment (for example "dairy-eggs-fridge"),
 * never a keyword somewhere in a long path or a product name.
 */
export function retailerPathDepartment(value: string | null | undefined): SupermarketDepartment | null {
  if (!value) return null;
  const segments = value
    .split(/[\\/|>]+/)
    .map((segment) => normaliseProductText(segment))
    .filter(Boolean)
    .flatMap((segment) => [segment, segment.replace(/^(?:browse|products|shop)\s+/, "")]);

  for (const segment of segments) {
    const canonical = canonicalDepartments.get(segment);
    if (canonical) return canonical;
    const alias = departmentAliases.get(segment);
    if (alias && alias !== "Other") return alias;
  }
  return null;
}

export function productDepartment(category: string | null | undefined, productName: string): SupermarketDepartment {
  const canonicalStoredDepartment = canonicalDepartments.get(normaliseProductText(category ?? ""));
  // Pantry is the legacy fallback for many imports. Override it only when the
  // name states an unambiguous Baby product; other stored departments retain
  // their source authority.
  if (canonicalStoredDepartment === "Pantry" && nameHasExplicitBabyDepartment(productName)) {
    return "Baby";
  }
  if (canonicalStoredDepartment) return canonicalStoredDepartment;

  const nameDepartment = departmentFromText(productName);
  if (nameDepartment && nameDepartment !== "Other") return nameDepartment;

  const storedDepartment = departmentFromText(category ?? "");
  if (storedDepartment && storedDepartment !== "Other") return storedDepartment;

  return "Other";
}
