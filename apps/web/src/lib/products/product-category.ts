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
  ["fruit and vegetables", "Fruit & vegetables"],
  ["fruit vegetables", "Fruit & vegetables"],
  ["fresh meat", "Meat & seafood"],
  ["seafood", "Meat & seafood"],
  ["meat and seafood", "Meat & seafood"],
  ["meat seafood", "Meat & seafood"],
  ["dairy eggs and fridge", "Dairy & eggs"],
  ["dairy eggs fridge", "Dairy & eggs"],
  ["dairy and eggs", "Dairy & eggs"],
  ["dairy eggs", "Dairy & eggs"],
  ["chilled", "Dairy & eggs"],
  ["freezer", "Frozen"],
  ["international", "Pantry"],
  ["international foods", "Pantry"],
  ["salt", "Pantry"],
  ["salts", "Pantry"],
  ["herbs and spices", "Pantry"],
  ["snacks and confectionery", "Confectionery"],
  ["snacks confectionery", "Confectionery"],
  ["health and beauty", "Health & personal care"],
  ["health beauty", "Health & personal care"],
  ["cleaning and household", "Household"],
  ["cleaning household", "Household"],
  ["pets", "Pet"],
]);

for (const department of supermarketDepartments) {
  departmentAliases.set(normaliseProductText(department), department);
}

const departmentRules: Array<{ department: SupermarketDepartment; terms: string[] }> = [
  {
    department: "Drinks",
    terms: [
      "cola", "cordial", "drink", "energy drink", "iced tea", "juice",
      "lemonade", "mineral water", "soft drink", "sparkling water", "sports drink", "water",
    ],
  },
  {
    department: "Fruit & vegetables",
    terms: [
      "apple", "apricot", "asparagus", "avocado", "banana", "bean sprouts",
      "beetroot", "broccoli", "cabbage", "capsicum", "carrot", "cauliflower",
      "celery", "chilli", "coriander", "cucumber", "eggplant", "garlic",
      "ginger", "grape", "green bean", "herb", "kiwifruit", "leek", "lemon",
      "lettuce", "lime", "mandarin", "mango", "mushroom", "nectarine", "onion",
      "orange", "parsley", "pea", "pear", "potato", "pumpkin", "spinach",
      "spring onion", "strawberry", "sweet potato", "tomato", "zucchini",
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
    terms: ["butter", "cheese", "cream", "egg", "fresh milk", "margarine", "yoghurt", "yogurt"],
  },
  {
    department: "Bakery",
    terms: ["bagel", "bread", "brioche", "bun", "croissant", "flatbread", "pita", "roll", "tortilla", "wrap"],
  },
  {
    department: "Frozen",
    terms: ["frozen", "ice cream"],
  },
  {
    department: "Confectionery",
    terms: ["biscuit", "candy", "chocolate", "confectionery", "lollies", "lolly", "snack bar"],
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
      "baking powder", "bean", "cereal", "chickpea", "coffee", "flour", "honey",
      "lentil", "noodle", "oats", "oil", "pasta", "pepper", "rice", "salt",
      "sauce", "spice", "stock", "sugar", "tea", "vinegar",
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

export function inferProductCategory(value: string) {
  return departmentFromText(value);
}

export function productDepartment(category: string | null | undefined, productName: string): SupermarketDepartment {
  return departmentFromText(category ?? "")
    ?? departmentFromText(productName)
    ?? "Other";
}
