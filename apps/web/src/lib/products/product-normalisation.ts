export type ParsedProductName = {
  raw: string;
  canonicalName: string;
  searchName: string;
  slug: string;
  quantity: number | null;
  unit: string | null;
  packQuantity: number | null;
  packUnit: string | null;
  form: string | null;
  variants: string[];
  aliases: string[];
};

const fractionValues: Record<string, number> = {
  "¼": 0.25,
  "½": 0.5,
  "¾": 0.75,
  "⅓": 1 / 3,
  "⅔": 2 / 3,
  "⅛": 0.125,
  "⅜": 0.375,
  "⅝": 0.625,
  "⅞": 0.875,
};

const spellingCorrections: Array<[RegExp, string]> = [
  [/\bavacado(?:es|s)?\b/gi, "avocado"],
  [/\btamato(?:es|s)?\b/gi, "tomato"],
  [/\blentles\b/gi, "lentils"],
  [/\bcapsicumms?\b/gi, "capsicum"],
];

const synonymGroups: Array<{ canonical: string; aliases: string[] }> = [
  { canonical: "zucchini", aliases: ["courgette", "courgettes"] },
  { canonical: "capsicum", aliases: ["bell pepper", "bell peppers"] },
  { canonical: "coriander", aliases: ["cilantro"] },
  { canonical: "spring onion", aliases: ["green onion", "green onions", "scallion", "scallions"] },
  { canonical: "eggplant", aliases: ["aubergine", "aubergines"] },
  { canonical: "chickpeas", aliases: ["garbanzo beans", "garbanzo"] },
  { canonical: "beef stock", aliases: ["beef broth"] },
  { canonical: "chicken stock", aliases: ["chicken broth"] },
  { canonical: "vegetable stock", aliases: ["vegetable broth", "veggie stock"] },
];

const variantGroups: Array<{ canonical: string; aliases: string[] }> = [
  { canonical: "no added salt", aliases: ["no salt added"] },
  { canonical: "reduced salt", aliases: ["salt reduced", "low salt", "lower salt"] },
  { canonical: "no added sugar", aliases: ["no sugar added"] },
  { canonical: "reduced fat", aliases: ["low fat", "lite", "light"] },
  { canonical: "gluten free", aliases: [] },
  { canonical: "lactose free", aliases: [] },
  { canonical: "wholemeal", aliases: ["whole wheat"] },
  { canonical: "free range", aliases: [] },
  { canonical: "organic", aliases: [] },
];

const formGroups: Array<{ canonical: string; aliases: string[] }> = [
  { canonical: "chopped", aliases: ["diced"] },
  { canonical: "crushed", aliases: [] },
  { canonical: "whole", aliases: [] },
  { canonical: "paste", aliases: [] },
  { canonical: "passata", aliases: [] },
  { canonical: "dried", aliases: ["dry"] },
  { canonical: "frozen", aliases: [] },
  { canonical: "fresh", aliases: [] },
  { canonical: "ground", aliases: ["minced"] },
  { canonical: "fillet", aliases: ["fillets"] },
];

const preparationWords = new Set([
  "coarsely",
  "finely",
  "roughly",
  "thinly",
  "thickly",
  "chopped",
  "diced",
  "sliced",
  "grated",
  "crushed",
  "drained",
  "rinsed",
  "trimmed",
  "peeled",
  "seeded",
  "halved",
  "quartered",
  "optional",
  "divided",
  "melted",
  "softened",
  "cooked",
]);

const containerWords = new Set([
  "can",
  "cans",
  "tin",
  "tins",
  "jar",
  "jars",
  "packet",
  "packets",
  "pack",
  "packs",
  "bottle",
  "bottles",
  "bunch",
  "bunches",
]);

function cleanWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function normaliseProductText(value: string) {
  return cleanWhitespace(
    value
      .toLocaleLowerCase("en-AU")
      .replace(/[’']/g, "")
      .replace(/&/g, " and ")
      .replace(/[-_/]+/g, " ")
      .replace(/[^a-z0-9. ]+/g, " "),
  );
}

export function slugifyProductName(value: string) {
  return normaliseProductText(value).replace(/\s+/g, "-");
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

  for (const [pattern, replacement] of spellingCorrections) {
    result = result.replace(pattern, replacement);
  }

  for (const group of synonymGroups) {
    for (const alias of group.aliases) {
      result = result.replace(new RegExp(`\\b${alias.replace(/\s+/g, "\\s+")}\\b`, "gi"), group.canonical);
    }
  }

  return cleanWhitespace(result);
}

function findGroup(value: string, groups: Array<{ canonical: string; aliases: string[] }>) {
  const normalised = normaliseProductText(value);

  for (const group of groups) {
    const terms = [group.canonical, ...group.aliases];
    if (terms.some((term) => normalised.includes(normaliseProductText(term)))) {
      return group.canonical;
    }
  }

  return null;
}

function stripRecipePrefix(value: string) {
  return value
    .replace(/^\s*x\s+/i, "")
    .replace(
      /^\s*(?:(\d+\s+\d+\/\d+|\d+\/\d+|[¼½¾⅓⅔⅛⅜⅝⅞]|\d+(?:\.\d+)?)\s*)?(?:x\s*)?(?:(\d+(?:\.\d+)?)\s*(kg|g|mg|ml|l)\b\s*)?/i,
      "",
    )
    .replace(/^\s*(?:cups?|tablespoons?|tbsp|teaspoons?|tsp)\b\s*/i, "")
    .replace(/^\s*(?:cans?|tins?|jars?|packets?|packs?|bottles?|bunches?)\s+(?:of\s+)?/i, "")
    .trim();
}

function extractQuantities(value: string) {
  const prefix = value.match(
    /^\s*(?:x\s*)?(?:(\d+\s+\d+\/\d+|\d+\/\d+|[¼½¾⅓⅔⅛⅜⅝⅞]|\d+(?:\.\d+)?)\s*)?(?:x\s*)?(?:(\d+(?:\.\d+)?)\s*(kg|g|mg|ml|l)\b)?/i,
  );

  const quantity = parseNumber(prefix?.[1]);
  const packQuantity = prefix?.[2] ? Number(prefix[2]) : null;
  const packUnit = prefix?.[3]?.toLocaleLowerCase("en-AU") ?? null;

  const unitMatch = value.match(/\b(cups?|tablespoons?|tbsp|teaspoons?|tsp|cans?|tins?|jars?|packets?|packs?|bottles?|bunches?)\b/i);

  return {
    quantity,
    unit: unitMatch?.[1]?.toLocaleLowerCase("en-AU") ?? null,
    packQuantity: Number.isFinite(packQuantity) ? packQuantity : null,
    packUnit,
  };
}

function productTokens(value: string) {
  return normaliseProductText(value)
    .split(" ")
    .filter(Boolean)
    .filter((token) => !preparationWords.has(token))
    .filter((token) => !containerWords.has(token))
    .filter((token) => !/^\d+(?:\.\d+)?$/.test(token))
    .filter((token) => !["kg", "g", "mg", "ml", "l", "cup", "cups", "tbsp", "tsp", "x"].includes(token));
}

function canonicaliseCoreName(value: string, form: string | null, variants: string[]) {
  let tokens = productTokens(value);

  for (const variant of variants) {
    const variantTokens = normaliseProductText(variant).split(" ");
    tokens = tokens.filter((token) => !variantTokens.includes(token));
  }

  if (form) {
    const formGroup = formGroups.find((group) => group.canonical === form);
    const formTokens = [form, ...(formGroup?.aliases ?? [])]
      .flatMap((term) => normaliseProductText(term).split(" "));
    tokens = tokens.filter((token) => !formTokens.includes(token));
  }

  const core = cleanWhitespace(tokens.join(" "));
  return core || normaliseProductText(value);
}

export function parseProductName(rawValue: string): ParsedProductName {
  const raw = cleanWhitespace(rawValue);
  const withoutNotes = raw.split(",")[0]?.trim() || raw;
  const corrected = replaceAliases(withoutNotes);
  const quantities = extractQuantities(corrected);
  const stripped = stripRecipePrefix(corrected);

  const variants = variantGroups
    .map((group) => findGroup(stripped, [group]))
    .filter((value): value is string => Boolean(value));
  const form = findGroup(stripped, formGroups);
  const coreName = canonicaliseCoreName(stripped, form, variants);
  const canonicalName = cleanWhitespace([form, coreName].filter(Boolean).join(" "));
  const searchName = cleanWhitespace([...variants, canonicalName].join(" "));

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
    searchName,
    slug: slugifyProductName(canonicalName),
    quantity: quantities.quantity,
    unit: quantities.unit,
    packQuantity: quantities.packQuantity,
    packUnit: quantities.packUnit,
    form,
    variants,
    aliases: [...aliases].map(cleanWhitespace).filter(Boolean),
  };
}
