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
  "portion", "steak", "tomato",
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

const significantProductForms = [
  "juice", "rind", "zest", "paste", "passata", "powder", "flakes",
];

function cleanIdentityName(value: string) {
  const parsed = parseProductName(value);
  let name = parsed.canonicalName
    .replace(/\b(?:roughly|finely|thinly|thickly)\b/gi, "")
    .replace(/\b(?:chopped|diced|sliced|grated|quartered|halved)\b/gi, "")
    .replace(/\bwedges?\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  const normalised = normaliseProductText(name);

  // A fillet is a naturally variable count item. Recipe portion weights do not
  // create a separate grocery identity.
  if (normalised.includes("salmon") && normalised.includes("fillet")) {
    return normalised.includes("skinless")
      ? "skinless salmon fillets"
      : "salmon fillets";
  }

  if (/^lemons?$/.test(normalised)) return "lemon";
  if (/^limes?$/.test(normalised)) return "lime";
  if (/^red onions?$/.test(normalised)) return "red onion";
  if (/^brown onions?$/.test(normalised)) return "brown onion";

  return normalised;
}

export function foodItemIdentity(value: string) {
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
  const identity = foodItemIdentity(value);
  const shape = foodItemShape(value);

  // Naturally variable count items share an inventory identity even when a
  // recipe supplied an indicative gram weight for each piece.
  if (shape === "COUNT_VARIABLE") return identity;

  // These forms are genuinely different things in a kitchen and must remain
  // distinct (for example Lemon, Lemon Juice and Lemon Rind).
  const significantForm = significantProductForms.find((form) => identity.includes(form));
  return significantForm ? identity : identity;
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
