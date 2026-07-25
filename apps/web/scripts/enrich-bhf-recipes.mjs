import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const CATALOGUE = path.resolve("src/generated/bhf-recipes.json");
const CONCURRENCY = 4;

const headers = {
  "User-Agent": "FoodRecipeCatalogue/1.0 (+personal health recipe catalogue)",
  Accept: "text/html,application/xhtml+xml",
  "Accept-Language": "en-GB,en;q=0.9",
};

function decodeHtml(value = "") {
  return value
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&ndash;/gi, "–")
    .replace(/&mdash;/gi, "—")
    .replace(/&frac14;/gi, "¼")
    .replace(/&frac12;/gi, "½")
    .replace(/&frac34;/gi, "¾")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
}

function stripHtml(html = "") {
  return decodeHtml(
    html
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(?:p|div|li|h\d|section|article|ol|ul)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function findRecipeNode(value) {
  if (Array.isArray(value)) {
    for (const child of value) {
      const found = findRecipeNode(child);
      if (found) return found;
    }
    return null;
  }

  if (!value || typeof value !== "object") return null;

  const type = value["@type"];
  const types = Array.isArray(type) ? type : [type];
  if (types.some((item) => typeof item === "string" && item.toLowerCase() === "recipe")) {
    return value;
  }

  for (const child of Object.values(value)) {
    const found = findRecipeNode(child);
    if (found) return found;
  }

  return null;
}

function recipeJsonLd(html) {
  for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const recipe = findRecipeNode(JSON.parse(match[1].trim()));
      if (recipe) return recipe;
    } catch {
      // Ignore malformed JSON-LD blocks.
    }
  }
  return null;
}

function metaContent(html, property) {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const direct = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"));
  if (direct) return decodeHtml(direct[1]).trim();
  const reverse = html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, "i"));
  return reverse ? decodeHtml(reverse[1]).trim() : null;
}

function imageFromSchema(value) {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const image = imageFromSchema(item);
      if (image) return image;
    }
    return null;
  }
  if (typeof value === "object") {
    return imageFromSchema(value.url ?? value.contentUrl ?? value.thumbnailUrl);
  }
  return null;
}

function ingredientTexts(recipe) {
  if (!Array.isArray(recipe?.recipeIngredient)) return [];
  return recipe.recipeIngredient
    .map((item) => stripHtml(String(item ?? "")))
    .filter(Boolean);
}

function instructionTexts(value) {
  if (!value) return [];
  if (typeof value === "string") {
    return value
      .split(/\r?\n+/)
      .map((item) => stripHtml(item))
      .filter(Boolean);
  }
  if (Array.isArray(value)) return value.flatMap(instructionTexts);
  if (typeof value === "object") {
    if (typeof value.text === "string") return instructionTexts(value.text);
    if (Array.isArray(value.itemListElement)) return instructionTexts(value.itemListElement);
    if (typeof value.name === "string" && value.name.trim()) return [stripHtml(value.name)];
  }
  return [];
}

function sectionLines(text, startLabel, endLabels) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const start = lines.findIndex((line) => new RegExp(`^${startLabel}\b`, "i").test(line));
  if (start < 0) return [];

  let end = lines.length;
  for (let index = start + 1; index < lines.length; index++) {
    if (endLabels.some((label) => new RegExp(`^${label}\b`, "i").test(lines[index]))) {
      end = index;
      break;
    }
  }

  return lines
    .slice(start + 1, end)
    .map((line) => line.replace(/^Step\s*\d+\s*:?\s*/i, "").trim())
    .filter(Boolean);
}

async function fetchHtml(url, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url, {
        headers,
        redirect: "follow",
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 900));
      }
    }
  }
  throw lastError;
}

async function enrich(recipe) {
  const html = await fetchHtml(recipe.sourceUrl);
  const text = stripHtml(html);
  const schema = recipeJsonLd(html);

  const schemaIngredients = ingredientTexts(schema);
  const schemaInstructions = instructionTexts(schema?.recipeInstructions);

  const ingredients = schemaIngredients.length
    ? schemaIngredients
    : sectionLines(text, "Ingredients", ["Method", "Directions", "Instructions", "Nutritional Information"]);

  const instructions = schemaInstructions.length
    ? schemaInstructions
    : sectionLines(text, "Method", ["Nutritional Information", "How we made it healthier", "Cook's tip", "You might also"]);

  const imageUrl =
    imageFromSchema(schema?.image) ??
    metaContent(html, "og:image") ??
    metaContent(html, "twitter:image") ??
    recipe.imageUrl ??
    null;

  return {
    ...recipe,
    imageUrl,
    ingredients,
    instructions,
  };
}

async function mapConcurrent(values, concurrency, mapper) {
  const results = new Array(values.length);
  let index = 0;

  async function worker() {
    while (true) {
      const current = index++;
      if (current >= values.length) return;
      const value = values[current];
      try {
        results[current] = await mapper(value, current);
      } catch (error) {
        console.error(`Failed: ${value.name} (${value.sourceUrl})`);
        console.error(error instanceof Error ? error.message : error);
        results[current] = value;
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, () => worker()));
  return results;
}

async function main() {
  const catalogue = JSON.parse(await readFile(CATALOGUE, "utf8"));
  const recipes = Array.isArray(catalogue.recipes) ? catalogue.recipes : [];

  console.log(`Enriching ${recipes.length} BHF recipes with ingredients, method and image...`);
  let completed = 0;

  const enriched = await mapConcurrent(recipes, CONCURRENCY, async (recipe) => {
    const result = await enrich(recipe);
    completed++;
    console.log(`[${completed}/${recipes.length}] ${recipe.name} — ${result.ingredients.length} ingredients, ${result.instructions.length} steps`);
    return result;
  });

  const output = {
    ...catalogue,
    generatedAt: new Date().toISOString(),
    count: enriched.length,
    recipes: enriched,
  };

  await writeFile(CATALOGUE, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(`\nUpdated ${CATALOGUE}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
