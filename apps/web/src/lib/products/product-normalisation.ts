export type ProductAttributes = {
  preparation: string[];
  variety: string | null;
  cut: string | null;
  skin: "on" | "off" | null;
  state: "fresh" | "frozen" | "dried" | "canned" | null;
  component: string | null;
};

export type ParsedProductName = {
  raw: string;
  canonicalName: string;
  canonicalKey: string;
  searchName: string;
  slug: string;
  quantity: number | null;
  unit: string | null;
  packQuantity: number | null;
  packUnit: string | null;
  form: string | null;
  variants: string[];
  aliases: string[];
  attributes: ProductAttributes;
};

const fractionValues: Record<string, number> = {
  "¼": 0.25, "½": 0.5, "¾": 0.75, "⅓": 1 / 3, "⅔": 2 / 3,
  "⅛": 0.125, "⅜": 0.375, "⅝": 0.625, "⅞": 0.875,
};

const spellingCorrections: Array<[RegExp, string]> = [
  [/\bavacado(?:es|s)?\b/gi, "avocado"],
  [/\btamato(?:es|s)?\b/gi, "tomato"],
  [/\blentles\b/gi, "lentils"],
  [/\bcapsicumms?\b/gi, "capsicum"],
  [/\bslcd\b/gi, "sliced"],
  [/\b200gram\b/gi, "200 g"],
  [/\b1kg\b/gi, "1 kg"],
];

const synonymGroups: Array<{ canonical: string; aliases: string[] }> = [
  { canonical: "zucchini", aliases: ["courgette", "courgettes"] },
  { canonical: "capsicum", aliases: ["bell pepper", "bell peppers"] },
  { canonical: "coriander", aliases: ["cilantro"] },
  { canonical: "spring onion", aliases: ["green onion", "green onions", "scallion", "scallions"] },
  { canonical: "eggplant", aliases: ["aubergine", "aubergines"] },
  { canonical: "chickpea", aliases: ["chickpeas", "garbanzo beans", "garbanzo"] },
  { canonical: "beef stock", aliases: ["beef broth"] },
  { canonical: "chicken stock", aliases: ["chicken broth"] },
  { canonical: "vegetable stock", aliases: ["vegetable broth", "veggie stock"] },
  {
    canonical: "button mushroom",
    aliases: [
      "button mushrooms",
      "sliced mushroom",
      "sliced mushrooms",
      "coles sliced mushroom",
      "coles sliced mushrooms",
      "coles slcd mushroom",
      "coles slcd mushrooms",
    ],
  },
];

const retailerWords = new Set(["coles", "woolworths", "aldi", "costco"]);

const variantGroups: Array<{ canonical: string; aliases: string[] }> = [
  { canonical: "no added salt", aliases: ["no salt added"] },
  { canonical: "reduced salt", aliases: ["salt reduced", "low salt", "lower salt"] },
  { canonical: "no added sugar", aliases: ["no sugar added"] },
  { canonical: "fat free", aliases: ["0% fat", "zero fat", "no fat"] },
  { canonical: "reduced fat", aliases: ["low fat", "lite", "light"] },
  { canonical: "gluten free", aliases: [] },
  { canonical: "lactose free", aliases: [] },
  { canonical: "wholemeal", aliases: ["whole wheat"] },
  { canonical: "free range", aliases: [] },
  { canonical: "organic", aliases: [] },
];

const preparationTerms = [
  "coarsely chopped", "finely chopped", "roughly chopped", "thinly sliced",
  "thickly sliced", "chopped", "diced", "sliced", "grated", "shredded",
  "crushed", "drained", "rinsed", "trimmed", "peeled", "seeded",
  "halved", "quartered", "melted", "softened", "cooked",
] as const;

const recipePreparationSuffixes = [
  /\btrimmed\s+of\s+woody\s+stalks?\b.*$/i,
  /\bcut\s+into\s+(?:(?:\d+(?:\.\d+)?)\s*)?(?:cm|centimetres?)?\s*(?:pieces?|slices?|wedges?|cubes?)\b.*$/i,
];

const removableWords = new Set([
  "coarsely", "finely", "roughly", "thinly", "thickly", "chopped", "diced",
  "sliced", "grated", "shredded", "crushed", "drained", "rinsed", "trimmed",
  "peeled", "seeded", "halved", "quartered", "optional", "divided", "melted",
  "softened", "cooked", "fresh", "frozen", "dried", "skinless", "skin-on",
  "skin", "on", "off", "fillet", "fillets", "portion", "portions",
]);

const containerWords = new Set([
  "can", "cans", "tin", "tins", "jar", "jars", "packet", "packets", "pack",
  "packs", "bottle", "bottles", "bunch", "bunches",
]);

const singularOverrides = new Map<string, string>([
  ["carrots", "carrot"], ["lemons", "lemon"], ["limes", "lime"],
  ["onions", "onion"], ["tomatoes", "tomato"], ["potatoes", "potato"],
  ["mushrooms", "mushroom"], ["capsicums", "capsicum"], ["avocados", "avocado"],
  ["bananas", "banana"], ["apples", "apple"], ["pears", "pear"],
  ["chickpeas", "chickpea"], ["lentils", "lentil"], ["beans", "bean"],
  ["prawns", "prawn"], ["fillets", "fillet"], ["breasts", "breast"],
  ["pecans", "pecan"], ["hazelnuts", "hazelnut"],
  ["cloves", "clove"],
]);

const titleLowercase = new Set(["and", "of", "or", "the", "with"]);

function cleanWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function normaliseProductText(value: string) {
  return cleanWhitespace(
    value
      .toLocaleLowerCase("en-AU")
      .replace(/[’']/g, "")
      .replace(/&/g, " and ")
      .replace(/[‐‑‒–—]/g, "-")
      .replace(/[-_/]+/g, " ")
      .replace(/[^a-z0-9. ]+/g, " "),
  );
}

export function slugifyProductName(value: string) {
  return normaliseProductText(value).replace(/\s+/g, "-");
}

function titleCase(value: string) {
  return normaliseProductText(value)
    .split(" ")
    .filter(Boolean)
    .map((word, index) => index > 0 && titleLowercase.has(word)
      ? word
      : `${word.charAt(0).toLocaleUpperCase("en-AU")}${word.slice(1)}`)
    .join(" ");
}

function parseNumber(value: string | undefined): number | null {
  if (!value) return null;
  if (fractionValues[value] !== undefined) return fractionValues[value];
  const mixed = value.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const fraction = value.match(/^(\d+)\/(\d+)$/);
  if (fraction) return Number(fraction[1]) / Number(fraction[2]);
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function replaceAliases(value: string) {
  let result = value;
  for (const [pattern, replacement] of spellingCorrections) result = result.replace(pattern, replacement);
  for (const group of synonymGroups) {
    for (const alias of group.aliases) {
      result = result.replace(new RegExp(`\\b${alias.replace(/\s+/g, "\\s+")}\\b`, "gi"), group.canonical);
    }
  }
  return cleanWhitespace(result);
}

function extractQuantities(value: string) {
  const measuredPrefix = value.match(/^\s*(?:x\s*)?(?:(\d+\s+\d+\/\d+|\d+\/\d+|[¼½¾⅓⅔⅛⅜⅝⅞]|\d+(?:\.\d+)?)\s*x\s*)?(\d+(?:\.\d+)?)\s*(kg|g|mg|ml|l)\b/i);
  const countPrefix = measuredPrefix
    ? null
    : value.match(/^\s*(?:x\s*)?(\d+\s+\d+\/\d+|\d+\/\d+|[¼½¾⅓⅔⅛⅜⅝⅞]|\d+(?:\.\d+)?)(?=\s|$)/i);
  const quantity = parseNumber(measuredPrefix?.[1] ?? countPrefix?.[1]);
  const packQuantity = measuredPrefix?.[2] ? Number(measuredPrefix[2]) : null;
  const packUnit = measuredPrefix?.[3]?.toLocaleLowerCase("en-AU") ?? null;
  const unitMatch = value.match(/\b(cups?|tablespoons?|tbsp|teaspoons?|tsp|cans?|tins?|jars?|packets?|packs?|bottles?|bunches?|fillets?|pieces?|items?)\b/i);
  return {
    quantity,
    unit: unitMatch?.[1]?.toLocaleLowerCase("en-AU") ?? null,
    packQuantity: Number.isFinite(packQuantity) ? packQuantity : null,
    packUnit,
  };
}

function stripRecipePrefix(value: string) {
  const withoutMarker = value.replace(/^\s*x\s+/i, "");
  const measuredPrefix = /^\s*(?:(?:\d+\s+\d+\/\d+|\d+\/\d+|[¼½¾⅓⅔⅛⅜⅝⅞]|\d+(?:\.\d+)?)\s*x\s*)?\d+(?:\.\d+)?\s*(?:kg|g|mg|ml|l)\b\s*/i;
  const countPrefix = /^\s*(?:\d+\s+\d+\/\d+|\d+\/\d+|[¼½¾⅓⅔⅛⅜⅝⅞]|\d+(?:\.\d+)?)\s*/i;
  const withoutQuantity = measuredPrefix.test(withoutMarker)
    ? withoutMarker.replace(measuredPrefix, "")
    : withoutMarker.replace(countPrefix, "");
  return withoutQuantity
    .replace(/^\s*(?:cups?|tablespoons?|tbsp|teaspoons?|tsp)\b\s*/i, "")
    .replace(/^\s*(?:cans?|tins?|jars?|packets?|packs?|bottles?|bunches?)\s+(?:of\s+)?/i, "")
    .trim();
}

function stripRecipePreparationSuffix(value: string) {
  return cleanWhitespace(recipePreparationSuffixes.reduce(
    (cleaned, pattern) => cleaned.replace(pattern, " "),
    value,
  )).replace(/\b(?:and|or|with|of)\s*$/i, "").trim();
}

function containsTerm(value: string, term: string) {
  return new RegExp(`\\b${term.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&").replace(/\s+/g, "\\s+")}\\b`, "i").test(value);
}

function extractPreparation(value: string) {
  return preparationTerms.filter((term) => containsTerm(value, term));
}

function extractVariants(value: string) {
  const normalised = normaliseProductText(value);
  return variantGroups
    .filter((group) => [group.canonical, ...group.aliases].some((term) => containsTerm(normalised, normaliseProductText(term))))
    .map((group) => group.canonical);
}

function detectAttributes(value: string): ProductAttributes {
  const normalised = normaliseProductText(value);
  const variety = containsTerm(normalised, "atlantic salmon") ? "Atlantic"
    : containsTerm(normalised, "sockeye salmon") ? "Sockeye"
      : containsTerm(normalised, "pink salmon") ? "Pink"
        : null;
  const cut = /\bfillets?\b/.test(normalised) ? "Fillet"
    : /\bbreasts?\b/.test(normalised) ? "Breast"
      : /\bsteaks?\b/.test(normalised) ? "Steak"
        : null;
  const skin = /\b(?:skinless|skin off)\b/.test(normalised) ? "off"
    : /\bskin on\b/.test(normalised) ? "on"
      : null;
  const state = /\bfrozen\b/.test(normalised) ? "frozen"
    : /\bdried\b/.test(normalised) ? "dried"
      : /\bcanned|tinned\b/.test(normalised) ? "canned"
        : /\bfresh\b/.test(normalised) ? "fresh"
          : null;
  const component = /\b(?:rind|zest)\b/.test(normalised) ? "Rind"
    : /\bjuice\b/.test(normalised) ? "Juice"
      : /\bpaste\b/.test(normalised) ? "Paste"
        : null;

  return { preparation: extractPreparation(value), variety, cut, skin, state, component };
}

function singulariseTokens(tokens: string[]) {
  return tokens.map((token) => singularOverrides.get(token) ?? token);
}

function collapseRepeatedSequence(tokens: string[]) {
  for (let sequenceLength = 1; sequenceLength <= Math.floor(tokens.length / 2); sequenceLength += 1) {
    if (tokens.length % sequenceLength !== 0) continue;
    const sequence = tokens.slice(0, sequenceLength);
    const repeated = tokens.every((token, index) => token === sequence[index % sequenceLength]);
    if (repeated) return sequence;
  }
  return tokens;
}

function canonicalCore(value: string, variants: string[], attributes: ProductAttributes) {
  let tokens = normaliseProductText(value).split(" ").filter(Boolean);
  const variantTokens = new Set(variants.flatMap((variant) => normaliseProductText(variant).split(" ")));
  const reducedFat = variants.includes("reduced fat") || variants.includes("fat free");
  tokens = tokens
    .filter((token) => !removableWords.has(token))
    .filter((token) => !containerWords.has(token))
    .filter((token) => !retailerWords.has(token))
    .filter((token) => !variantTokens.has(token))
    .filter((token) => !(reducedFat && ["low", "lite", "light", "0"].includes(token)))
    .filter((token) => !/^\d+(?:\.\d+)?$/.test(token))
    .filter((token) => !["kg", "g", "mg", "ml", "l", "cup", "cups", "tbsp", "tsp", "x"].includes(token));

  if (attributes.variety && tokens.includes("salmon")) {
    tokens = tokens.filter((token) => !["atlantic", "sockeye", "pink"].includes(token));
  }

  const component = attributes.component?.toLocaleLowerCase("en-AU") ?? null;
  const canonicalTokens = collapseRepeatedSequence(singulariseTokens(tokens));
  while (["and", "or", "with", "of"].includes(canonicalTokens.at(-1) ?? "")) canonicalTokens.pop();
  const core = canonicalTokens.join(" ");
  if (component && !core.includes(component)) return `${core} ${component}`.trim();
  return core || normaliseProductText(value);
}

export function parseProductName(rawValue: string): ParsedProductName {
  const raw = cleanWhitespace(rawValue);
  const corrected = replaceAliases(raw);
  const quantities = extractQuantities(corrected);
  const stripped = stripRecipePreparationSuffix(stripRecipePrefix(corrected));
  const attributes = detectAttributes(stripped);
  const variants = extractVariants(stripped);
  const coreName = canonicalCore(stripped, variants, attributes);
  const canonicalName = titleCase(coreName);
  const canonicalKey = slugifyProductName(canonicalName);
  const searchName = cleanWhitespace([...variants, attributes.variety, attributes.cut, canonicalName].filter(Boolean).join(" "));
  const form = attributes.component ?? attributes.cut ?? attributes.state;

  const aliases = new Set<string>([
    raw,
    stripped,
    coreName,
    canonicalName,
    searchName,
  ]);

  return {
    raw,
    canonicalName,
    canonicalKey,
    searchName,
    slug: canonicalKey,
    quantity: quantities.quantity,
    unit: quantities.unit,
    packQuantity: quantities.packQuantity,
    packUnit: quantities.packUnit,
    form,
    variants,
    aliases: [...aliases].filter(Boolean),
    attributes,
  };
}

