import { normaliseProductText, parseProductName } from "@/lib/products/product-normalisation";

export const GROCERY_IDENTITY_ENGINE_VERSION = "1.0.0";

export type GroceryIdentity = {
  source: string;
  canonicalName: string;
  normalised: string;
  variant: string | null;
  preparation: string[];
  size: string | null;
  confidence: number;
  evidence: string[];
};

const technicalTokens = new Set([
  "css", "font", "style", "inherit", "weight", "webkit", "text", "decoration",
  "display", "flex", "grid", "margin", "padding", "border", "background", "colour",
  "color", "line", "height", "letter", "spacing", "align", "justify", "position",
]);

const measureTokens = new Set([
  "quantity", "tablespoon", "tablespoons", "teaspoon", "teaspoons", "tbsp", "tsp",
  "cup", "cups", "gram", "grams", "kilogram", "kilograms", "kg", "g", "ml", "litre",
  "litres", "spray",
]);

const sizes = new Set(["small", "medium", "large", "mini", "baby"]);

const preparationWords = new Set([
  "blanched", "boiled", "chopped", "cooked", "cooled", "cored", "crushed", "deseeded",
  "diced", "drained", "finely", "grated", "halved", "lightly", "melted", "minced",
  "peeled", "quartered", "rinsed", "roasted", "roughly", "seeded", "shredded", "sifted",
  "sliced", "softened", "steamed", "thickly", "thinly", "toasted", "trimmed", "unpeeled",
  "warmed", "removed",
]);

const variantPhrases = [
  "extra virgin", "wholemeal", "multigrain", "sourdough", "basmati", "jasmine", "brown",
  "white", "skim", "full cream", "extra lean", "lean", "organic",
] as const;

function titleCase(value: string) {
  return value
    .toLocaleLowerCase("en-AU")
    .replace(/(^|[\s/(-])([a-z])/g, (_match, prefix: string, letter: string) => `${prefix}${letter.toLocaleUpperCase("en-AU")}`);
}

function stripTechnicalNoise(value: string, evidence: string[]) {
  const tokens = normaliseProductText(value).split(" ").filter(Boolean);
  const cleaned = tokens.filter((rawToken) => {
    const token = rawToken.replace(/^[.#]+/, "");
    const mixedClass = /[a-z]/.test(token) && /\d/.test(token);
    if (mixedClass || technicalTokens.has(token)) {
      evidence.push("technical noise removed");
      return false;
    }
    return Boolean(token);
  });
  return cleaned.join(" ");
}

function stripRecipePhrases(value: string, evidence: string[]) {
  let result = value
    .replace(/^quantity\s+of\s+/, "")
    .replace(/\bcut\s+into\b.*$/, "")
    .replace(/\bhusks?\s+and\s+silk\s+removed\b.*$/, "")
    .replace(/\bto\s+serve\b.*$/, "")
    .replace(/\bfor\s+garnish\b.*$/, "")
    .replace(/\bplus\s+extra\b.*$/, "")
    .replace(/\bto\s+taste\b.*$/, "")
    .replace(/\s+/g, " ")
    .trim();

  const tokens = result.split(" ").filter(Boolean);
  while (tokens.length && measureTokens.has(tokens[0])) {
    tokens.shift();
    evidence.push("recipe measurement removed");
  }
  while (tokens.length && ["and", "or", "with", "of", "into"].includes(tokens.at(-1)!)) tokens.pop();
  result = tokens.join(" ");
  return result;
}

export function identifyGrocery(value: string): GroceryIdentity | null {
  const source = value.trim();
  if (!source) return null;

  const evidence: string[] = [];
  let working = stripTechnicalNoise(source, evidence);
  working = stripRecipePhrases(working, evidence);
  if (!working) return null;

  const tokens = working.split(" ").filter(Boolean);
  const preparation: string[] = [];
  let size: string | null = null;

  const identityTokens = tokens.filter((token, index) => {
    if (sizes.has(token) && index === 0) {
      size = titleCase(token);
      evidence.push("size separated from identity");
      return false;
    }
    if (preparationWords.has(token)) {
      preparation.push(titleCase(token));
      evidence.push("preparation separated from identity");
      return false;
    }
    return true;
  });

  let cleaned = identityTokens.join(" ").replace(/\s+/g, " ").trim();
  if (!cleaned) return null;

  let variant: string | null = null;
  for (const phrase of variantPhrases) {
    if (cleaned === phrase || !cleaned.includes(phrase)) continue;
    if (["brown rice", "white rice", "extra virgin olive oil"].includes(cleaned)) {
      variant = titleCase(phrase);
      evidence.push("meaningful variant retained");
      break;
    }
  }

  cleaned = normaliseProductText(parseProductName(cleaned).canonicalName);
  if (!cleaned || cleaned.length > 120 || /^[.#]/.test(cleaned)) return null;

  const confidencePenalty = Math.min(0.2, Math.max(0, evidence.filter((item) => item === "technical noise removed").length - 1) * 0.02);
  const confidence = Math.max(0.6, Math.min(0.99, 0.92 + Math.min(0.07, evidence.length * 0.015) - confidencePenalty));

  return {
    source,
    canonicalName: titleCase(cleaned),
    normalised: cleaned,
    variant,
    preparation: [...new Set(preparation)],
    size,
    confidence,
    evidence: [...new Set(evidence.length ? evidence : ["normalised grocery identity"])],
  };
}
