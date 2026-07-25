import { unstable_cache } from "next/cache";
import type { ExternalRecipe } from "./external-recipes";
import { externalRecipes } from "./external-recipes";

const reserveRecipes: ExternalRecipe[] = [
  {
    id: "reserve-rte-chickpea-curry",
    name: "Easy Chickpea Curry",
    description: "A quick chickpea curry with tomato, spices and coconut milk.",
    sourceName: "RecipeTin Eats",
    sourceUrl: "https://www.recipetineats.com/easy-chickpea-curry/",
    sourceHomeUrl: "https://www.recipetineats.com/",
    imageUrl: null,
    minutes: null,
    servings: null,
    licence: "Used under the RecipeTin Eats recipe and photo sharing policy.",
    tags: ["Legumes", "High fibre", "Vegetarian"],
  },
  {
    id: "reserve-rte-bean-soup",
    name: "Bean Soup",
    description: "A hearty vegetable and bean soup for an easy high-fibre meal.",
    sourceName: "RecipeTin Eats",
    sourceUrl: "https://www.recipetineats.com/bean-soup/",
    sourceHomeUrl: "https://www.recipetineats.com/",
    imageUrl: null,
    minutes: null,
    servings: null,
    licence: "Used under the RecipeTin Eats recipe and photo sharing policy.",
    tags: ["Legumes", "High fibre", "Soup"],
  },
  {
    id: "reserve-rte-moroccan-lentil-soup",
    name: "Moroccan Lentil Soup",
    description: "A warmly spiced lentil soup with vegetables and herbs.",
    sourceName: "RecipeTin Eats",
    sourceUrl: "https://www.recipetineats.com/moroccan-lentil-soup/",
    sourceHomeUrl: "https://www.recipetineats.com/",
    imageUrl: null,
    minutes: null,
    servings: null,
    licence: "Used under the RecipeTin Eats recipe and photo sharing policy.",
    tags: ["Legumes", "High fibre", "Soup"],
  },
  {
    id: "reserve-rte-greek-chicken",
    name: "Greek Chicken",
    description: "Lemon, garlic and herb chicken suitable for bowls and salads.",
    sourceName: "RecipeTin Eats",
    sourceUrl: "https://www.recipetineats.com/greek-chicken/",
    sourceHomeUrl: "https://www.recipetineats.com/",
    imageUrl: null,
    minutes: null,
    servings: null,
    licence: "Used under the RecipeTin Eats recipe and photo sharing policy.",
    tags: ["Lean protein", "Mediterranean", "Chicken"],
  },
  {
    id: "reserve-rte-baked-fish",
    name: "Baked Fish with Lemon Cream Sauce",
    description: "Oven-baked white fish with lemon and herbs.",
    sourceName: "RecipeTin Eats",
    sourceUrl: "https://www.recipetineats.com/baked-fish-with-lemon-cream-sauce/",
    sourceHomeUrl: "https://www.recipetineats.com/",
    imageUrl: null,
    minutes: null,
    servings: null,
    licence: "Used under the RecipeTin Eats recipe and photo sharing policy.",
    tags: ["Fish", "Quick", "Lean protein"],
  },
  {
    id: "reserve-rte-roasted-vegetables",
    name: "Roasted Vegetables",
    description: "A colourful tray of seasoned roasted vegetables.",
    sourceName: "RecipeTin Eats",
    sourceUrl: "https://www.recipetineats.com/roasted-vegetables/",
    sourceHomeUrl: "https://www.recipetineats.com/",
    imageUrl: null,
    minutes: null,
    servings: null,
    licence: "Used under the RecipeTin Eats recipe and photo sharing policy.",
    tags: ["Vegetables", "Vegetarian", "Side"],
  },
  {
    id: "reserve-rte-chicken-barley-soup",
    name: "Chicken Barley Soup",
    description: "Chicken, barley and vegetables in a comforting broth.",
    sourceName: "RecipeTin Eats",
    sourceUrl: "https://www.recipetineats.com/chicken-barley-soup/",
    sourceHomeUrl: "https://www.recipetineats.com/",
    imageUrl: null,
    minutes: null,
    servings: null,
    licence: "Used under the RecipeTin Eats recipe and photo sharing policy.",
    tags: ["Wholegrain", "Lean protein", "Soup"],
  },
  {
    id: "reserve-rte-salmon-salad",
    name: "Salmon Salad",
    description: "A fresh salmon salad with crisp vegetables and herbs.",
    sourceName: "RecipeTin Eats",
    sourceUrl: "https://www.recipetineats.com/salmon-salad/",
    sourceHomeUrl: "https://www.recipetineats.com/",
    imageUrl: null,
    minutes: null,
    servings: null,
    licence: "Used under the RecipeTin Eats recipe and photo sharing policy.",
    tags: ["Fish", "Omega-3", "Salad"],
  },
];

function decodeHtml(value: string) {
  return value.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");
}

function normaliseImage(value: unknown, baseUrl: URL) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(decodeHtml(value.trim()), baseUrl);
    return /^https?:$/.test(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function imageFromJsonLd(value: unknown, baseUrl: URL): string | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const image = imageFromJsonLd(item, baseUrl);
      if (image) return image;
    }
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const types = Array.isArray(record["@type"]) ? record["@type"] : [record["@type"]];
  const recipe = types.some((type) => typeof type === "string" && type.toLowerCase() === "recipe");
  if (recipe) {
    const candidates = Array.isArray(record.image) ? record.image : [record.image];
    for (const candidate of candidates) {
      if (typeof candidate === "string") {
        const image = normaliseImage(candidate, baseUrl);
        if (image) return image;
      }
      if (candidate && typeof candidate === "object") {
        const imageRecord = candidate as Record<string, unknown>;
        const image = normaliseImage(imageRecord.url ?? imageRecord.contentUrl, baseUrl);
        if (image) return image;
      }
    }
  }
  for (const nested of Object.values(record)) {
    const image = imageFromJsonLd(nested, baseUrl);
    if (image) return image;
  }
  return null;
}

function extractImage(html: string, sourceUrl: URL) {
  const jsonLd = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(jsonLd)) {
    try {
      const image = imageFromJsonLd(JSON.parse(match[1].trim()), sourceUrl);
      if (image) return image;
    } catch {
      // Continue to metadata fallbacks.
    }
  }
  const patterns = [
    /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/i,
    /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i,
    /<img[^>]+(?:data-lazy-src|data-src|data-original|src)=["']([^"']+)["']/i,
  ];
  for (const pattern of patterns) {
    const image = normaliseImage(html.match(pattern)?.[1], sourceUrl);
    if (image && !/logo|icon|avatar|placeholder|social-share|default[-_]?image/i.test(image)) return image;
  }
  return null;
}

async function inspectRecipe(recipe: ExternalRecipe): Promise<ExternalRecipe | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);
  try {
    const page = await fetch(recipe.sourceUrl, {
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; FoodRecipeAudit/1.0)",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-AU,en;q=0.9",
      },
    });
    if (!page.ok || !page.headers.get("content-type")?.includes("text/html")) return null;
    const finalUrl = new URL(page.url || recipe.sourceUrl);
    const imageUrl = recipe.imageUrl ?? extractImage(await page.text(), finalUrl);
    if (!imageUrl) return null;

    const image = await fetch(imageUrl, {
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; FoodRecipeAudit/1.0)",
        Accept: "image/avif,image/webp,image/*,*/*;q=0.8",
        Referer: finalUrl.toString(),
      },
    });
    const contentType = image.headers.get("content-type") ?? "";
    if (!image.ok || !contentType.startsWith("image/")) return null;
    await image.body?.cancel();

    return { ...recipe, sourceUrl: finalUrl.toString(), imageUrl };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function auditInBatches(recipes: ExternalRecipe[]) {
  const working: ExternalRecipe[] = [];
  for (let index = 0; index < recipes.length; index += 8) {
    const batch = recipes.slice(index, index + 8);
    const results = await Promise.all(batch.map(inspectRecipe));
    working.push(...results.filter((recipe): recipe is ExternalRecipe => Boolean(recipe)));
  }
  return working;
}

export const getAuditedExternalRecipes = unstable_cache(
  async () => {
    const primary = await auditInBatches(externalRecipes);
    const missing = Math.max(0, externalRecipes.length - primary.length);
    if (missing === 0) return primary;
    const reserves = await auditInBatches(reserveRecipes);
    return [...primary, ...reserves.slice(0, missing)];
  },
  ["audited-external-recipes-v2"],
  { revalidate: 60 * 60 * 24 },
);
