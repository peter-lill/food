import { normaliseProductText } from "./product-normalisation";

export type GenericProducePresentation = "loose" | "bag" | "half" | "whole" | "bunch" | "pack" | "tray" | "punnet";

export type GenericProduceClassification = {
  familyName: string;
  familyKey: string;
  presentation: GenericProducePresentation;
  presentationSize: string | null;
  comparisonKey: string;
  variantName: string;
};

const produceTerms = [
  "apple", "apricot", "asparagus", "avocado", "banana", "basil", "bean sprouts",
  "beetroot", "broad bean", "broccoli", "broccolini", "brussels sprout", "cabbage",
  "capsicum", "carrot", "cauliflower", "celery", "chilli", "chives", "coriander",
  "corn", "cucumber", "dill", "edamame", "eggplant", "french bean", "garlic",
  "ginger", "grape", "green bean", "herb", "kale", "kiwifruit", "leek", "lemon",
  "lettuce", "lime", "mandarin", "mango", "mint", "mushroom", "nectarine", "onion",
  "orange", "oregano", "parsley", "pea", "pear", "potato", "pumpkin", "radish",
  "rocket", "rosemary", "sage", "spinach", "spring onion", "strawberry",
  "sweet potato", "thyme", "tomato", "watermelon", "zucchini",
] as const;

const producePattern = new RegExp(`\\b(?:${[...produceTerms]
  .sort((left, right) => right.length - left.length)
  .map((term) => term.replace(/ /g, "\\s+") + "s?")
  .join("|")})\\b`);

const titleLowercase = new Set(["and", "of", "or", "the", "with"]);

function titleCase(value: string) {
  return value.split(" ").filter(Boolean).map((word, index) => (
    index > 0 && titleLowercase.has(word)
      ? word
      : `${word.charAt(0).toLocaleUpperCase("en-AU")}${word.slice(1)}`
  )).join(" ");
}

function sizeToken(value: string) {
  const match = normaliseProductText(value).match(/\b(\d+(?:\.\d+)?)\s*(kg|g|ml|l)\b/);
  return match ? `${match[1]}${match[2]}` : null;
}

/**
 * Classifies fresh produce without erasing a sellable variant. Retailer-only
 * wording such as `Loose`, `Each`, or an approximate per-piece weight shares
 * one comparison identity. Physical presentations remain distinct so a bag,
 * punnet, half, or whole item is never price-compared as though it were loose.
 */
export function classifyGenericProduce(
  name: string,
  packSize: string | null | undefined = null,
): GenericProduceClassification | null {
  let working = normaliseProductText(name)
    .replace(/^(?:coles|woolworths|aldi|drakes)\s+/, "")
    .replace(/\bsliced\s+mushrooms?\b/g, "button mushroom")
    .replace(/\brocket\b(?!\s+leaves)/g, "rocket leaves")
    .replace(/\bapprox(?:imately)?\.?\s+\d+(?:\.\d+)?\s*(?:kg|g)\s+per\s+(?:piece|each)\b/g, " ")
    .replace(/\bper\s+(?:piece|each)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!producePattern.test(working)) return null;

  const combined = `${working} ${normaliseProductText(packSize ?? "")}`.trim();
  let presentation: GenericProducePresentation = "loose";
  if (/\bhalf\b/.test(working)) presentation = "half";
  else if (/\b(?:whole|full)\b/.test(working)) presentation = "whole";
  else if (/\bpunnet\b/.test(combined)) presentation = "punnet";
  else if (/\btray\b/.test(combined)) presentation = "tray";
  else if (/\bbag(?:ged)?\b|\bnet\b/.test(combined)) presentation = "bag";
  else if (/\bbunch\b/.test(combined)) presentation = "bunch";
  else if (/\bpack(?:ed)?\b|\bpacket\b/.test(combined)) presentation = "pack";

  const presentationSize = presentation === "loose" || presentation === "half" || presentation === "whole"
    ? null
    : sizeToken(combined);

  working = working
    .replace(/\b(?:loose|each|ea)\b/g, " ")
    .replace(/\b(?:half|whole|full)\b/g, " ")
    .replace(/\b(?:extra\s+large|small|medium|large|xl)\b/g, " ")
    .replace(/\b(?:bagged|bag|net|punnet|tray|bunch|packed|pack|packet)\b/g, " ")
    .replace(/\bapprox(?:imately)?\.?/g, " ")
    .replace(/\b\d+(?:\.\d+)?\s*(?:kg|g|ml|l)\b/g, " ")
    .replace(/\b\d+\s*(?:pk|pack)\b/g, " ")
    .replace(/\b\d+\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!working || !producePattern.test(working)) return null;

  const familyName = titleCase(working);
  const familyKey = normaliseProductText(familyName);
  const presentationKey = [presentation, presentationSize].filter(Boolean).join(":");
  const variantSuffix = presentation === "loose"
    ? ""
    : ` ${titleCase([presentationSize, presentation].filter(Boolean).join(" "))}`;
  return {
    familyName,
    familyKey,
    presentation,
    presentationSize,
    comparisonKey: `${familyKey}|${presentationKey}`,
    variantName: `${familyName}${variantSuffix}`,
  };
}
