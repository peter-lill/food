import { normaliseProductText } from "./product-normalisation";

const categoryRules: Array<{ category: string; terms: string[] }> = [
  {
    category: "Fruit and Vegetables",
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
    category: "Meat and Seafood",
    terms: [
      "barramundi", "beef", "chicken", "fish", "lamb", "mince", "pork",
      "prawn", "salmon", "sardine", "steak", "trout", "tuna", "turkey",
    ],
  },
  {
    category: "Dairy and Eggs",
    terms: [
      "butter", "cheese", "cream", "egg", "milk", "yoghurt", "yogurt",
    ],
  },
  {
    category: "Bakery",
    terms: ["bagel", "bread", "bun", "flatbread", "pita", "roll", "tortilla", "wrap"],
  },
  {
    category: "Pantry",
    terms: [
      "bean", "chickpea", "flour", "lentil", "noodle", "oil", "pasta",
      "rice", "sauce", "spice", "stock", "sugar", "vinegar",
    ],
  },
  {
    category: "Frozen",
    terms: ["frozen"],
  },
  {
    category: "Drinks",
    terms: ["coffee", "juice", "soft drink", "sparkling water", "tea", "water"],
  },
];

export function inferProductCategory(value: string) {
  const normalised = normaliseProductText(value);
  const rule = categoryRules.find(({ terms }) => terms.some((term) => {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
    return new RegExp(`\\b${escaped}\\b`, "i").test(normalised);
  }));
  return rule?.category ?? null;
}
