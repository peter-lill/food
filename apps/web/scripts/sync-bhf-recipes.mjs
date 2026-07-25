import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";


const BASE =
  "https://www.bhf.org.uk/informationsupport/support/healthy-living/healthy-eating/recipe-finder";
const OUTPUT = path.resolve("src/generated/bhf-recipes.json");

const PAGE_COUNT = 24;
const CONCURRENCY = 5;

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
    .replace(/&frac34;/gi, "¾");
}

function stripHtml(html = "") {
  return decodeHtml(
    html
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(?:p|div|li|h\d|section)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function absoluteUrl(value) {
  try {
    return new URL(value, BASE).toString();
  } catch {
    return null;
  }
}

function slugFromUrl(url) {
  return new URL(url).pathname.split("/").filter(Boolean).at(-1) ?? "";
}

function idFromUrl(url) {
  return `bhf-${slugFromUrl(url)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`;
}

function numberFrom(value) {
  if (value == null) return null;
  const match = String(value).replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function durationMinutes(text) {
  if (!text) return null;

  const iso = String(text).match(
    /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i,
  );

  if (iso) {
    return (
      Number(iso[1] ?? 0) * 1440 +
      Number(iso[2] ?? 0) * 60 +
      Number(iso[3] ?? 0) +
      Math.round(Number(iso[4] ?? 0) / 60)
    );
  }

  let minutes = 0;
  const hours = String(text).match(/(\d+)\s*(?:hours?|hrs?)/i);
  const mins = String(text).match(/(\d+)\s*(?:minutes?|mins?)/i);

  if (hours) minutes += Number(hours[1]) * 60;
  if (mins) minutes += Number(mins[1]);

  return minutes || null;
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

  if (
    types.some(
      (item) => typeof item === "string" && item.toLowerCase() === "recipe",
    )
  ) {
    return value;
  }

  for (const child of Object.values(value)) {
    const found = findRecipeNode(child);
    if (found) return found;
  }

  return null;
}

function recipeJsonLd(html) {
  const scripts = html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );

  for (const match of scripts) {
    try {
      const parsed = JSON.parse(match[1].trim());
      const recipe = findRecipeNode(parsed);
      if (recipe) return recipe;
    } catch {
      // Ignore malformed JSON-LD blocks.
    }
  }

  return null;
}

function metaContent(html, property) {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const first = html.match(
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`,
      "i",
    ),
  );
  if (first) return decodeHtml(first[1]).trim();

  const reverse = html.match(
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`,
      "i",
    ),
  );

  return reverse ? decodeHtml(reverse[1]).trim() : null;
}

function canonicalUrl(html, fallback) {
  const direct = html.match(
    /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["'][^>]*>/i,
  );
  if (direct) return absoluteUrl(direct[1]) ?? fallback;

  const reverse = html.match(
    /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["'][^>]*>/i,
  );

  return reverse ? absoluteUrl(reverse[1]) ?? fallback : fallback;
}

function h1(html) {
  const match = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  return match ? stripHtml(match[1]) : null;
}

function visibleValue(text, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(
    new RegExp(
      `\\b${escaped}\\s*:?\\s*([^\\n]{1,100}?)(?=\\n|$)`,
      "i",
    ),
  );

  return match?.[1]?.trim() ?? null;
}

function nutritionFromVisibleText(text) {
  const sectionMatch = text.match(
    /Nutritional Information([\s\S]*?)(?:Ingredients|Method|How we made it healthier|Cook.?s tip|$)/i,
  );

  const section = sectionMatch?.[1] ?? text;

  const energy = section.match(
    /Energy\s+([\d,.]+)\s*kJ\s+([\d,.]+)\s*kcal/i,
  );

  const value = (label) => {
    const match = section.match(
      new RegExp(`(?:${label})\\s+([\\d,.]+)\\s*g\\b`, "i"),
    );
    return match?.[1] ? Number(match[1].replace(/,/g, "")) : null;
  };

  return {
    energyKj: energy ? Number(energy[1].replace(/,/g, "")) : null,
    calories: energy ? Number(energy[2].replace(/,/g, "")) : null,
    carbsGrams: value("Carbs?|Carbohydrates?"),
    fibreGrams: value("Fibre|Fiber"),
    fatGrams: value("Fat"),
    saturatedFatGrams: value("Saturates?|Saturated fat"),
    sugarGrams: value("Sugars?"),
    saltGrams: value("Salt"),
  };
}

function nutritionFromSchema(recipe) {
  const n = recipe?.nutrition;
  if (!n || typeof n !== "object") return {};

  return {
    calories: numberFrom(n.calories),
    carbsGrams: numberFrom(n.carbohydrateContent),
    fibreGrams: numberFrom(n.fiberContent ?? n.fibreContent),
    fatGrams: numberFrom(n.fatContent),
    saturatedFatGrams: numberFrom(n.saturatedFatContent),
    sugarGrams: numberFrom(n.sugarContent),
    saltGrams: null,
  };
}

function mergeNutrition(primary, fallback) {
  return {
    energyKj: primary.energyKj ?? fallback.energyKj ?? null,
    calories: primary.calories ?? fallback.calories ?? null,
    carbsGrams: primary.carbsGrams ?? fallback.carbsGrams ?? null,
    fibreGrams: primary.fibreGrams ?? fallback.fibreGrams ?? null,
    fatGrams: primary.fatGrams ?? fallback.fatGrams ?? null,
    saturatedFatGrams:
      primary.saturatedFatGrams ?? fallback.saturatedFatGrams ?? null,
    sugarGrams: primary.sugarGrams ?? fallback.sugarGrams ?? null,
    saltGrams: primary.saltGrams ?? fallback.saltGrams ?? null,
  };
}

function cleanCategories(value) {
  const values = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[,|]/)
      : [];

  return [...new Set(values.map((item) => String(item).trim()).filter(Boolean))];
}

function findRecipeLinks(html) {
  const links = new Set();

  for (const match of html.matchAll(/href=["']([^"']+)["']/gi)) {
    const url = absoluteUrl(match[1]);
    if (!url) continue;

    const parsed = new URL(url);
    const base = new URL(BASE);

    if (parsed.hostname !== base.hostname) continue;
    if (!parsed.pathname.startsWith(`${base.pathname}/`)) continue;

    const slug = slugFromUrl(url);
    if (!slug) continue;

    links.add(`${parsed.origin}${parsed.pathname}`);
  }

  return links;
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

      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }

      return {
        html: await response.text(),
        finalUrl: response.url,
      };
    } catch (error) {
      lastError = error;

      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 800));
      }
    }
  }

  throw lastError;
}

async function discoverRecipes() {
  const urls = new Set();

  for (let page = 1; page <= PAGE_COUNT; page++) {
    const pageUrl = `${BASE}?page=${page}&tab=recipes`;
    process.stdout.write(`Finder page ${page}/${PAGE_COUNT}... `);

    const { html } = await fetchHtml(pageUrl);
    const pageLinks = findRecipeLinks(html);

    for (const url of pageLinks) urls.add(url);

    console.log(`${pageLinks.size} links`);
  }

  return [...urls].sort();
}

async function readRecipe(url) {
  const { html, finalUrl } = await fetchHtml(url);
  const text = stripHtml(html);
  const schema = recipeJsonLd(html);

  const sourceUrl = canonicalUrl(html, finalUrl);
  const name =
    (typeof schema?.name === "string" && schema.name.trim()) ||
    h1(html) ||
    metaContent(html, "og:title") ||
    slugFromUrl(sourceUrl);

  const schemaYield = Array.isArray(schema?.recipeYield)
    ? schema.recipeYield[0]
    : schema?.recipeYield;

  const servings =
    numberFrom(schemaYield) ??
    numberFrom(visibleValue(text, "Serves"));

  const prepMinutes =
    durationMinutes(schema?.prepTime) ??
    durationMinutes(visibleValue(text, "Preparation"));

  const cookMinutes =
    durationMinutes(schema?.cookTime) ??
    durationMinutes(visibleValue(text, "Cook"));

  const totalMinutes =
    durationMinutes(schema?.totalTime) ??
    durationMinutes(visibleValue(text, "Total time")) ??
    (prepMinutes != null || cookMinutes != null
      ? (prepMinutes ?? 0) + (cookMinutes ?? 0)
      : null);

  const visibleNutrition = nutritionFromVisibleText(text);
  const schemaNutrition = nutritionFromSchema(schema);

  const nutrition = mergeNutrition(schemaNutrition, visibleNutrition);

  const mealType = visibleValue(text, "Meal type");

  const tags = cleanCategories([
    ...cleanCategories(schema?.recipeCategory),
    ...cleanCategories(schema?.keywords),
    ...cleanCategories(mealType),
  ]);

  return {
    id: idFromUrl(sourceUrl),
    name,
    description: `A heart-healthy recipe from the British Heart Foundation.`,
    sourceName: "British Heart Foundation",
    sourceUrl,
    sourceHomeUrl: "https://www.bhf.org.uk/",
    imageUrl: null,
    minutes: totalMinutes,
    prepMinutes,
    cookMinutes,
    servings,
    licence:
      "Recipe metadata and source link shown with attribution to the British Heart Foundation.",
    tags,
    nutrition,
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
        console.error(`Failed: ${value}`);
        console.error(error);
        results[current] = null;
      }
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, values.length) },
      () => worker(),
    ),
  );

  return results.filter(Boolean);
}

async function main() {
  console.log("Discovering current BHF recipe catalogue...");
  const urls = await discoverRecipes();

  console.log(`\nDiscovered ${urls.length} candidate recipe URLs.`);
  console.log("Fetching recipe metadata and nutrition...\n");

  let completed = 0;

  const recipes = await mapConcurrent(
    urls,
    CONCURRENCY,
    async (url) => {
      const recipe = await readRecipe(url);

      completed++;
      console.log(
        `[${completed}/${urls.length}] ${recipe.name}`,
      );

      return recipe;
    },
  );

  const byUrl = [
    ...new Map(
      recipes.map((recipe) => [recipe.sourceUrl, recipe]),
    ).values(),
  ];

  function normalisedName(value) {
    return value
      .toLocaleLowerCase("en-GB")
      .replace(/&/g, "and")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function recipeScore(recipe) {
    const nutritionScore = recipe.nutrition
      ? Object.values(recipe.nutrition).filter((value) => value != null).length
      : 0;

    return (
      nutritionScore * 10 +
      (recipe.servings != null ? 5 : 0) +
      (recipe.minutes != null ? 4 : 0) +
      (recipe.prepMinutes != null ? 2 : 0) +
      (recipe.cookMinutes != null ? 2 : 0) +
      recipe.tags.length
    );
  }

  const byName = new Map();

  for (const recipe of byUrl) {
    const key = normalisedName(recipe.name);
    const current = byName.get(key);

    if (!current || recipeScore(recipe) > recipeScore(current)) {
      byName.set(key, recipe);
    }
  }

  const unique = [...byName.values()]
    .sort((a, b) => a.name.localeCompare(b.name, "en-GB"));

  await mkdir(path.dirname(OUTPUT), { recursive: true });

  await writeFile(
    OUTPUT,
    `${JSON.stringify(
      {
        source: "British Heart Foundation",
        sourceUrl: BASE,
        generatedAt: new Date().toISOString(),
        count: unique.length,
        recipes: unique,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  console.log(`\nSaved ${unique.length} recipes to:`);
  console.log(OUTPUT);

  if (unique.length < 250) {
    console.warn(
      "\nWARNING: BHF currently exposes about 288 recipes, but fewer than 250 were generated.",
    );
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
