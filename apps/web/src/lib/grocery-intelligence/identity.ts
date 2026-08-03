import { normaliseProductText, parseProductName } from "@/lib/products/product-normalisation";
import { findGroceryConcept } from "./ontology";

export const GROCERY_IDENTITY_ENGINE_VERSION = "1.1.1";

export type GroceryIdentity = {
  source: string;
  canonicalName: string;
  normalised: string;
  family: string | null;
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

const sizes = new Set(["small", "medium", "large", "mini", "baby", "extra large"]);

const preparationPhrases: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bcore\s+removed\b/g, label: "Core Removed" },
  { pattern: /\bcored\b/g, label: "Cored" },
  { pattern: /\bhusks?\s+and\s+silk\s+removed\b/g, label: "Husks And Silk Removed" },
  { pattern: /\bseeds?\s+removed\b/g, label: "Seeds Removed" },
  { pattern: /\bstoned\b/g, label: "Stone Removed" },
  {
    pattern: /\bcut\s+into\s+(?:(?:\d+(?:\.\d+)?)\s*)?(?:cm|centimetres?)?\s*thick\s+slices?\b/g,
    label: "Cut Into Thick Slices",
  },
  { pattern: /\bcut\s+into\s+thin\s+wedges\b/g, label: "Cut Into Thin Wedges" },
  { pattern: /\bcut\s+into\s+wedges\b/g, label: "Cut Into Wedges" },
  { pattern: /\b(?:horizontally|vertically|lengthways|lengthwise|crosswise)\b/g, label: "Cut Direction Removed" },
  { pattern: /\b(?:freshly|finely|roughly|thinly|lightly)\b/g, label: "Preparation Modifier Removed" },
  { pattern: /\bcut\s+into\s+[^,;]+$/g, label: "Cut Into Pieces" },
  { pattern: /\blightly\s+toasted\b/g, label: "Lightly Toasted" },
  { pattern: /\bdry[ -]toasted\b/g, label: "Dry Toasted" },
  { pattern: /\bfinely\s+diced\b/g, label: "Finely Diced" },
  { pattern: /\bfinely\s+chopped\b/g, label: "Finely Chopped" },
  { pattern: /\bthinly\s+sliced\b/g, label: "Thinly Sliced" },
  { pattern: /\broughly\s+chopped\b/g, label: "Roughly Chopped" },
  { pattern: /\bpeeled\b/g, label: "Peeled" },
  { pattern: /\bunpeeled\b/g, label: "Unpeeled" },
  { pattern: /\btoasted\b/g, label: "Toasted" },
  { pattern: /\broasted\b/g, label: "Roasted" },
  { pattern: /\bchopped\b/g, label: "Chopped" },
  { pattern: /\bdiced\b/g, label: "Diced" },
  { pattern: /\bsliced\b/g, label: "Sliced" },
  { pattern: /\bgrated\b/g, label: "Grated" },
  { pattern: /\bcrushed\b/g, label: "Crushed" },
  { pattern: /\bdrained\b/g, label: "Drained" },
  { pattern: /\brinsed\b/g, label: "Rinsed" },
  { pattern: /\bsoftened\b/g, label: "Softened" },
  { pattern: /\bmelted\b/g, label: "Melted" },
  { pattern: /\btrimmed\b/g, label: "Trimmed" },
  { pattern: /\bends?\b/g, label: "Ends Removed" },
  { pattern: /\bhalved\b/g, label: "Halved" },
  { pattern: /\bquartered\b/g, label: "Quartered" },
];

const variantPhrases = [
  "extra virgin", "wholemeal", "multigrain", "sourdough", "basmati", "jasmine", "brown",
  "white", "skim", "full cream", "extra lean", "lean", "organic", "green", "red",
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

function stripRecipeNoise(value: string, evidence: string[]) {
  let result = value
    .replace(/^quantity\s+of\s+/, "")
    .replace(/\bto\s+serve\b.*$/, "")
    .replace(/\bfor\s+garnish\b.*$/, "")
    .replace(/\bplus\s+extra\b.*$/, "")
    .replace(/\bto\s+taste\b.*$/, "")
    .replace(/\s+/g, " ")
    .trim();

  const tokens = result.split(" ").filter(Boolean);
  while (tokens.length && (measureTokens.has(tokens[0]) || /^\d+(?:\.\d+)?$/.test(tokens[0]))) {
    tokens.shift();
    evidence.push("recipe measurement removed");
  }
  while (tokens.length && ["and", "or", "with", "of", "into"].includes(tokens.at(-1)!)) tokens.pop();
  result = tokens.join(" ");
  return result;
}

function extractPreparation(value: string, evidence: string[]) {
  let result = value;
  const preparation: string[] = [];
  for (const phrase of preparationPhrases) {
    phrase.pattern.lastIndex = 0;
    if (!phrase.pattern.test(result)) {
      phrase.pattern.lastIndex = 0;
      continue;
    }
    phrase.pattern.lastIndex = 0;
    result = result.replace(phrase.pattern, " ");
    preparation.push(phrase.label);
    evidence.push("preparation phrase separated from identity");
  }
  return { cleaned: result.replace(/\s+/g, " ").trim(), preparation: [...new Set(preparation)] };
}

function extractLeadingSize(value: string, evidence: string[]) {
  const tokens = value.split(" ").filter(Boolean);
  let size: string | null = null;
  const firstTwo = tokens.slice(0, 2).join(" ");
  if (sizes.has(firstTwo)) {
    size = titleCase(firstTwo);
    tokens.splice(0, 2);
  } else if (sizes.has(tokens[0])) {
    size = titleCase(tokens[0]);
    tokens.shift();
  }
  if (size) evidence.push("size separated from identity");
  return { cleaned: tokens.join(" "), size };
}

export function identifyGrocery(value: string): GroceryIdentity | null {
  const source = value.trim();
  if (!source) return null;

  const evidence: string[] = [];
  let working = stripTechnicalNoise(source, evidence);
  working = stripRecipeNoise(working, evidence);
  if (!working) return null;

  const preparationResult = extractPreparation(working, evidence);
  working = preparationResult.cleaned;
  const sizeResult = extractLeadingSize(working, evidence);
  working = sizeResult.cleaned;
  working = working.replace(/\b(?:core|seed|seeds|husk|husks|silk)\s+removed\b/g, " ").replace(/\s+/g, " ").trim();
  if (!working) return null;

  const concept = findGroceryConcept(working);
  let canonicalName: string;
  let family: string | null = null;
  let variant: string | null = null;

  if (concept) {
    canonicalName = concept.canonicalName;
    family = concept.family;
    evidence.push("protected grocery concept matched");
  } else {
    const parsed = normaliseProductText(parseProductName(working).canonicalName);
    if (!parsed || parsed.length > 120 || /^[.#]/.test(parsed)) return null;
    canonicalName = titleCase(parsed);
    for (const phrase of variantPhrases) {
      if (parsed.startsWith(`${phrase} `)) {
        variant = titleCase(phrase);
        break;
      }
    }
    evidence.push("normalised grocery identity");
  }

  const normalised = normaliseProductText(canonicalName);
  const confidencePenalty = Math.min(0.16, Math.max(0, evidence.filter((item) => item === "technical noise removed").length - 1) * 0.02);
  const ontologyBoost = concept ? 0.05 : 0;
  const confidence = Math.max(0.65, Math.min(0.99, 0.9 + ontologyBoost + Math.min(0.04, evidence.length * 0.01) - confidencePenalty));

  return {
    source,
    canonicalName,
    normalised,
    family,
    variant,
    preparation: preparationResult.preparation,
    size: sizeResult.size,
    confidence,
    evidence: [...new Set(evidence)],
  };
}
