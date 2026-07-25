import { prisma } from "@/lib/prisma";
import { externalRecipes } from "@/lib/recipes/external-recipes";

const sourceAliases = new Map([
  [
    "https://www.heartfoundation.org.au/recipes/six-ingredient-salmon",
    "https://www.heartfoundation.org.au/recipes/speedy-salmon-stirfry",
  ],
]);

type JsonRecord = Record<string, unknown>;

type ParsedIngredient = {
  name: string;
  quantity: number;
  unit: string;
};

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function isRecipe(record: JsonRecord) {
  const rawType = record["@type"];
  const types = Array.isArray(rawType) ? rawType : [rawType];
  return types.some((type) => typeof type === "string" && type.toLowerCase() === "recipe");
}

function findRecipe(value: unknown): JsonRecord | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const result = findRecipe(item);
      if (result) return result;
    }
    return null;
  }

  const record = asRecord(value);
  if (!record) return null;
  if (isRecipe(record)) return record;

  for (const nested of Object.values(record)) {
    const result = findRecipe(nested);
    if (result) return result;
  }

  return null;
}

function parseDuration(value: unknown) {
  if (typeof value !== "string") return null;
  const match = value.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i);
  if (!match) return null;
  return Number(match[1] ?? 0) * 1440 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0) + Math.round(Number(match[4] ?? 0) / 60);
}

function parseServings(value: unknown) {
  const text = Array.isArray(value) ? String(value[0] ?? "") : String(value ?? "");
  const match = text.match(/\d+(?:\.\d+)?/);
  return match ? Math.max(1, Math.round(Number(match[0]))) : 1;
}

function parseQuantityToken(token: string) {
  if (/^\d+\/\d+$/.test(token)) {
    const [top, bottom] = token.split("/").map(Number);
    return bottom ? top / bottom : null;
  }
  return /^\d+(?:\.\d+)?$/.test(token) ? Number(token) : null;
}

function normaliseFractions(value: string) {
  return value
    .replace(/½/g, " 1/2")
    .replace(/⅓/g, " 1/3")
    .replace(/⅔/g, " 2/3")
    .replace(/¼/g, " 1/4")
    .replace(/¾/g, " 3/4")
    .replace(/⅛/g, " 1/8")
    .replace(/⅜/g, " 3/8")
    .replace(/⅝/g, " 5/8")
    .replace(/⅞/g, " 7/8");
}

const units = [
  "tablespoons", "tablespoon", "tbsp",
  "teaspoons", "teaspoon", "tsp",
  "kilograms", "kilogram", "kg",
  "grams", "gram", "g",
  "millilitres", "millilitre", "milliliters", "milliliter", "ml",
  "litres", "litre", "liters", "liter", "l",
  "cups", "cup",
  "cans", "can", "tins", "tin",
  "fillets", "fillet",
  "slices", "slice",
  "cloves", "clove",
  "bunches", "bunch",
  "heads", "head",
];

const unitPattern = new RegExp(`^(${units.join("|")})\\b`, "i");

function normaliseUnit(unit: string) {
  const value = unit.toLowerCase();
  const map: Record<string, string> = {
    tablespoons: "tbsp", tablespoon: "tbsp",
    teaspoons: "tsp", teaspoon: "tsp",
    kilograms: "kg", kilogram: "kg",
    grams: "g", gram: "g",
    millilitres: "ml", millilitre: "ml", milliliters: "ml", milliliter: "ml",
    litres: "L", litre: "L", liters: "L", liter: "L", l: "L",
    cups: "cup", cup: "cup",
    cans: "tin", can: "tin", tins: "tin",
    fillets: "fillet", slices: "slice", cloves: "clove", bunches: "bunch", heads: "head",
  };
  return map[value] ?? value;
}

function cleanIngredientName(value: string) {
  return value
    .replace(/^[,;:\-–—\s]+/, "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/,\s*(divided|optional|to serve|for serving|plus more).*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseIngredient(value: unknown): ParsedIngredient | null {
  if (typeof value !== "string") return null;

  const tokens = normaliseFractions(value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim()).split(" ");
  if (!tokens.length) return null;

  let quantity = 1;
  const first = parseQuantityToken(tokens[0] ?? "");
  if (first !== null) {
    quantity = first;
    tokens.shift();
    const fraction = parseQuantityToken(tokens[0] ?? "");
    if (fraction !== null && (tokens[0] ?? "").includes("/")) {
      quantity += fraction;
      tokens.shift();
    }
  }

  let remainder = tokens.join(" ").trim();
  let unit = "each";
  const unitMatch = remainder.match(unitPattern);
  if (unitMatch) {
    unit = normaliseUnit(unitMatch[1]);
    remainder = remainder.slice(unitMatch[0].length).trim();
  }

  const name = cleanIngredientName(remainder);
  return name ? { name, quantity, unit } : null;
}

function instructionTexts(value: unknown): string[] {
  if (typeof value === "string") {
    return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  }
  if (!Array.isArray(value)) return [];

  const result: string[] = [];
  for (const item of value) {
    if (typeof item === "string" && item.trim()) {
      result.push(item.trim());
      continue;
    }
    const record = asRecord(item);
    if (!record) continue;
    if (typeof record.text === "string" && record.text.trim()) result.push(record.text.trim());
    if (record.itemListElement) result.push(...instructionTexts(record.itemListElement));
  }
  return result;
}

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&frac12;/gi, "½")
    .replace(/&frac14;/gi, "¼")
    .replace(/&frac34;/gi, "¾")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function textFromHtml(value: string) {
  return decodeHtml(value)
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractSection(html: string, startLabel: string, endLabels: string[]) {
  const start = html.search(new RegExp(`>\\s*${startLabel}\\s*<`, "i"));
  if (start < 0) return "";
  const remainder = html.slice(start);
  let end = remainder.length;
  for (const label of endLabels) {
    const index = remainder.search(new RegExp(`>\\s*${label}\\s*<`, "i"));
    if (index > 0) end = Math.min(end, index);
  }
  return remainder.slice(0, end);
}

function ingredientsFromHtml(html: string) {
  const section = extractSection(html, "Ingredients", ["Method", "Directions", "Instructions"]);
  if (!section) return [];

  const values = [...section.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)]
    .map((match) => textFromHtml(match[1]))
    .filter(Boolean);

  return values.map(parseIngredient).filter((entry): entry is ParsedIngredient => Boolean(entry));
}

function instructionsFromHtml(html: string) {
  const section = extractSection(html, "Method", ["Tip", "Tips", "Nutrition", "You might also be interested in"]);
  if (!section) return [];

  const paragraphs = [...section.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((match) => textFromHtml(match[1]))
    .filter((text) => text.length > 15 && !/^step\s*\d+$/i.test(text));

  return [...new Set(paragraphs)];
}

function deduplicateIngredients(entries: ParsedIngredient[]) {
  const byName = new Map<string, ParsedIngredient>();
  for (const entry of entries) {
    const key = entry.name.toLocaleLowerCase("en-AU");
    const current = byName.get(key);
    if (!current) {
      byName.set(key, entry);
    } else if (current.unit === entry.unit) {
      byName.set(key, { ...current, quantity: current.quantity + entry.quantity });
    }
  }
  return [...byName.values()];
}

export async function importHeartFoundationRecipe(externalRecipeId: string) {
  const sourceRecipe = externalRecipes.find((recipe) => recipe.id === externalRecipeId);
  if (!sourceRecipe || sourceRecipe.sourceName !== "Heart Foundation") {
    throw new Error("Only Heart Foundation recipes can currently be imported.");
  }

  const existing = await prisma.recipe.findFirst({
    where: { name: sourceRecipe.name },
    include: { ingredients: { include: { ingredient: true } } },
  });
  if (existing?.ingredients.length) return existing;

  const sourceUrl = sourceAliases.get(sourceRecipe.sourceUrl) ?? sourceRecipe.sourceUrl;
  const response = await fetch(sourceUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; FoodRecipeImporter/1.0)",
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "en-AU,en;q=0.9",
    },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Recipe source returned ${response.status}.`);

  const html = await response.text();
  const pattern = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let recipeNode: JsonRecord | null = null;

  for (const match of html.matchAll(pattern)) {
    try {
      recipeNode = findRecipe(JSON.parse(match[1].trim()));
      if (recipeNode) break;
    } catch {
      // Continue through malformed JSON-LD blocks.
    }
  }

  const schemaIngredients = recipeNode && Array.isArray(recipeNode.recipeIngredient)
    ? recipeNode.recipeIngredient.map(parseIngredient).filter((entry): entry is ParsedIngredient => Boolean(entry))
    : [];
  const ingredients = deduplicateIngredients(schemaIngredients.length ? schemaIngredients : ingredientsFromHtml(html));
  if (!ingredients.length) throw new Error("No importable ingredients found on the source page.");

  const schemaInstructions = recipeNode ? instructionTexts(recipeNode.recipeInstructions) : [];
  const instructions = schemaInstructions.length ? schemaInstructions : instructionsFromHtml(html);
  const description = recipeNode && typeof recipeNode.description === "string"
    ? recipeNode.description.trim()
    : sourceRecipe.description;
  const servings = recipeNode ? parseServings(recipeNode.recipeYield) : sourceRecipe.servings ?? 1;
  const prepMinutes = recipeNode ? parseDuration(recipeNode.prepTime) : null;
  const cookMinutes = recipeNode ? parseDuration(recipeNode.cookTime) : sourceRecipe.minutes;

  return prisma.$transaction(async (tx) => {
    const recipe = existing
      ? await tx.recipe.update({
          where: { id: existing.id },
          data: { description, servings, prepMinutes, cookMinutes, instructions: instructions.join("\n") },
        })
      : await tx.recipe.create({
          data: {
            name: sourceRecipe.name,
            description,
            servings,
            prepMinutes,
            cookMinutes,
            instructions: instructions.join("\n"),
          },
        });

    if (existing) {
      await tx.recipeIngredient.deleteMany({ where: { recipeId: recipe.id } });
    }

    for (const entry of ingredients) {
      const ingredient = await tx.ingredient.upsert({
        where: { name: entry.name },
        update: {},
        create: { name: entry.name },
      });
      await tx.recipeIngredient.create({
        data: {
          recipeId: recipe.id,
          ingredientId: ingredient.id,
          quantity: entry.quantity,
          unit: entry.unit,
        },
      });
    }

    return tx.recipe.findUniqueOrThrow({
      where: { id: recipe.id },
      include: { ingredients: { include: { ingredient: true } } },
    });
  });
}
