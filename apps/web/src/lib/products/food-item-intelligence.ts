import { normaliseProductText, parseProductName } from "./product-normalisation";

export type FoodItemShape =
  | "COUNT_VARIABLE"
  | "PACKAGED_FIXED"
  | "WEIGHT_VARIABLE"
  | "VOLUME_VARIABLE"
  | "BUNCH"
  | "UNKNOWN";

const countVariableTerms = [
  "apple", "apricot", "avocado", "banana", "breast", "burger patty",
  "chop", "drumstick", "egg", "fillet", "kiwifruit", "lemon", "lime",
  "mandarin", "mango", "nectarine", "onion", "orange", "peach", "pear",
  "portion", "salmon", "steak", "tomato",
];

const bunchTerms = [
  "basil", "coriander", "dill", "herb", "mint", "parsley", "spring onion",
];

const packagedTerms = [
  "beans", "bread", "butter", "canned", "can ", "cereal", "chopped tomatoes",
  "cream", "flour", "jar", "juice", "milk", "oil", "pasta", "passata",
  "rice", "sauce", "stock", "tomato paste", "yoghurt", "yogurt",
];

const weightVariableTerms = [
  "grapes", "mince", "mushroom", "nuts", "prawns", "spinach",
];

const sizeNeutralProduce = new Set([
  "apple", "apples", "apricot", "apricots", "avocado", "avocados",
  "banana", "bananas", "capsicum", "capsicums", "carrot", "carrots",
  "cucumber", "cucumbers", "kiwifruit", "lemon", "lemons", "lime", "limes",
  "mandarin", "mandarins", "mango", "mangoes", "mushroom", "mushrooms",
  "nectarine", "nectarines", "onion", "onions", "orange", "oranges",
  "peach", "peaches", "pear", "pears", "potato", "potatoes",
  "sweet potato", "sweet potatoes", "tomato", "tomatoes",
]);

// Recipe instructions describe preparation, not a separate grocery product.
const preparationNeutralWords = new Set([
  "blanched", "boiled", "chopped", "cooked", "cooled", "crushed", "deseeded",
  "diced", "drained", "finely", "grated", "halved", "lightly", "melted",
  "minced", "peeled", "quartered", "rinsed", "roasted", "roughly", "shredded",
  "sifted", "sliced", "softened", "steamed", "thickly", "thinly", "toasted",
  "trimmed", "warmed",
]);

const preparationNeutralPhrases = [
  "dry toasted",
  "lightly toasted",
  "freshly grated",
  "finely chopped",
  "roughly chopped",
  "thinly sliced",
  "thickly sliced",
] as const;

const technicalNameTerms = [
  "css", "font style", "font weight", "font family", "text decoration", "webkit",
  "display flex", "align items", "justify content", "background color", "rgba",
  "line height", "box sizing", "border radius",
];

export function isPlausibleGroceryName(value: string) {
  const raw = value.trim();
  if (raw.length < 2 || raw.length > 160) return false;
  if (/^[.#][a-z0-9_-]+/i.test(raw) || /[{};]/.test(raw)) return false;

  const normalised = normaliseProductText(raw);
  const technicalHits = technicalNameTerms.filter((term) => normalised.includes(normaliseProductText(term))).length;
  return technicalHits < 2;
}

function stripPreparationState(value: string) {
  let identity = value;

  for (const phrase of preparationNeutralPhrases) {
    const escaped = phrase.replace(/\s+/g, "\\s+");
    identity = identity.replace(new RegExp(`\\b${escaped}\\b`, "g"), " ");
  }

  return identity
    .split(" ")
    .filter((word) => word && !preparationNeutralWords.has(word))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalShoppingDescription(value: string) {
  let identity = stripPreparationState(normaliseProductText(value));

  const sizedProduce = identity.match(/^(?:small|medium|large)\s+(.+)$/);
  if (sizedProduce && sizeNeutralProduce.has(sizedProduce[1])) identity = sizedProduce[1];

  return identity
    .replace(/^(?:extra\s+lean|very\s+lean|lean|regular)\s+(beef\s+mince)$/, "$1")
    .replace(/^(beef\s+mince)\s+(?:extra\s+lean|very\s+lean|lean|regular)$/, "$1")
    .trim();
}

function cleanIdentityName(value: string) {
  return canonicalShoppingDescription(parseProductName(value).canonicalName);
}

export function foodItemIdentity(value: string) {
  if (!isPlausibleGroceryName(value)) return "";
  return cleanIdentityName(value);
}

export function foodItemShape(value: string): FoodItemShape {
  const identity = foodItemIdentity(value);

  if (bunchTerms.some((term) => identity.includes(term))) return "BUNCH";
  if (countVariableTerms.some((term) => identity.includes(term))) return "COUNT_VARIABLE";
  if (weightVariableTerms.some((term) => identity.includes(term))) return "WEIGHT_VARIABLE";
  if (packagedTerms.some((term) => identity.includes(term))) return "PACKAGED_FIXED";
  if (/\b(?:ml|litre|liter)\b/.test(identity)) return "VOLUME_VARIABLE";
  return "UNKNOWN";
}

export function shoppingIdentity(value: string) {
  return foodItemIdentity(value);
}

export function pantryIdentity(value: string) {
  return foodItemIdentity(value);
}

export function normaliseGroceryUnit(value: string | null | undefined) {
  const unit = normaliseProductText(value ?? "item");
  if (["item", "items", "each", "ea", "piece", "pieces", "portion", "portions", "fillet", "fillets"].includes(unit)) return "each";
  if (["gram", "grams"].includes(unit)) return "g";
  if (["kilogram", "kilograms"].includes(unit)) return "kg";
  if (["millilitre", "millilitres", "milliliter", "milliliters"].includes(unit)) return "mL";
  if (["litre", "litres", "liter", "liters"].includes(unit)) return "L";
  return unit || "item";
}
