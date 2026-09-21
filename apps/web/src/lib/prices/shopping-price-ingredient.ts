import { normaliseProductText } from "@/lib/products/product-normalisation";

const directAliases = new Map([
  ["all purpose flour", "Plain Flour"],
  ["all-purpose flour", "Plain Flour"],
  ["porridge oats", "Oats"],
]);

const leadingRecipeTerms = new Set([
  "a", "an", "the", "few", "pinch", "of", "small", "medium", "large", "ripe",
]);

const preparationOnlyTerms = new Set([
  "beaten", "chopped", "crushed", "diced", "grated", "minced", "peeled", "sliced", "torn",
]);

const trailingPreparationTerms = new Set([
  "beaten", "chopped", "diced", "grated", "minced", "peeled", "sliced", "torn",
]);

function titleCase(value: string) {
  return value.replace(/\b[a-z]/g, (letter) => letter.toLocaleUpperCase("en-AU"));
}

/**
 * Keep recipe wording on the shopping list while searching prices with the
 * purchasable ingredient. Recipe amounts, sizes and preparation are not a
 * distinct grocery product.
 */
export function shoppingPriceIngredientName(value: string): string | null {
  const raw = value.trim();
  if (preparationOnlyTerms.has(normaliseProductText(raw))) return null;
  const alias = directAliases.get(raw.toLocaleLowerCase("en-AU"));
  if (alias) return alias;

  const tokens = normaliseProductText(raw).split(" ").filter(Boolean);
  while (tokens.length > 1 && leadingRecipeTerms.has(tokens[0])) tokens.shift();
  while (tokens.length > 1 && trailingPreparationTerms.has(tokens.at(-1) ?? "")) tokens.pop();

  // A recipe asks for leaves, but the purchasable fresh-herb product is the
  // herb itself (for example, "a few coriander leaves" -> "coriander").
  if (tokens.length > 1 && ["leaf", "leaves"].includes(tokens.at(-1) ?? "")) tokens.pop();

  const result = tokens.join(" ").trim();
  return result ? titleCase(result) : raw;
}

function singularToken(value: string) {
  if (value.length > 4 && value.endsWith("ies")) return `${value.slice(0, -3)}y`;
  if (value.length > 3 && value.endsWith("s") && !value.endsWith("ss")) return value.slice(0, -1);
  return value;
}

const productQualifierTokens = new Set([
  "barn", "laid", "cavendish", "hass", "free", "range", "organic", "extra", "lean", "regular",
]);

const packagingTokens = new Set([
  "bunch", "each", "ea", "loose", "pack", "pk", "bag", "box", "bottle", "jar", "can", "tin",
]);

/** Normalised name tokens for safe retailer-product matching. */
export function shoppingPriceMatchTokens(value: string) {
  return normaliseProductText(value)
    .split(" ")
    .filter((token) => token && !/^\d/.test(token) && !packagingTokens.has(token))
    .map(singularToken);
}

/** True only when the retailer name adds no ingredient-changing words. */
export function isExactShoppingPriceIngredientName(expected: string, candidate: string) {
  const expectedTokens = shoppingPriceMatchTokens(expected).filter((token) => token.length > 1);
  const candidateTokens = new Set(shoppingPriceMatchTokens(candidate));
  return expectedTokens.length > 0
    && expectedTokens.every((token) => candidateTokens.has(token))
    && [...candidateTokens].every((token) => expectedTokens.includes(token) || productQualifierTokens.has(token));
}
