import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { externalRecipes } from "@/lib/recipes/external-recipes";

const cacheDirectory = path.join(process.cwd(), ".data", "recipe-images");

const sourceAliases = new Map([
  [
    "https://www.heartfoundation.org.au/recipes/six-ingredient-salmon",
    "https://www.heartfoundation.org.au/recipes/speedy-salmon-stirfry",
  ],
]);

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function normaliseImageUrl(value: unknown, baseUrl: URL) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(decodeHtml(value.trim()), baseUrl);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function isGenericImage(url: string) {
  const value = url.toLowerCase();
  return /logo|icon|avatar|spinner|placeholder|social-share|default[-_]?image|brandmark/.test(value);
}

function recipeImageFromJsonLd(value: unknown, baseUrl: URL): string | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const result = recipeImageFromJsonLd(item, baseUrl);
      if (result) return result;
    }
    return null;
  }

  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const rawType = record["@type"];
  const types = Array.isArray(rawType) ? rawType : [rawType];
  const isRecipe = types.some((type) => typeof type === "string" && type.toLowerCase() === "recipe");

  if (isRecipe) {
    const rawImage = record.image;
    const candidates = Array.isArray(rawImage) ? rawImage : [rawImage];
    for (const candidate of candidates) {
      if (typeof candidate === "string") {
        const image = normaliseImageUrl(candidate, baseUrl);
        if (image && !isGenericImage(image)) return image;
      }
      if (candidate && typeof candidate === "object") {
        const imageRecord = candidate as Record<string, unknown>;
        const image = normaliseImageUrl(imageRecord.url ?? imageRecord.contentUrl, baseUrl);
        if (image && !isGenericImage(image)) return image;
      }
    }
  }

  for (const nested of Object.values(record)) {
    const result = recipeImageFromJsonLd(nested, baseUrl);
    if (result) return result;
  }
  return null;
}

function extractImageUrl(html: string, sourceUrl: URL) {
  const jsonLdPattern = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(jsonLdPattern)) {
    try {
      const image = recipeImageFromJsonLd(JSON.parse(match[1].trim()), sourceUrl);
      if (image) return image;
    } catch {
      // Ignore malformed blocks and continue.
    }
  }

  const metaPatterns = [
    /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/i,
    /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image(?::src)?["']/i,
    /<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i,
    /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']image_src["']/i,
  ];

  for (const pattern of metaPatterns) {
    const image = normaliseImageUrl(html.match(pattern)?.[1], sourceUrl);
    if (image && !isGenericImage(image)) return image;
  }

  const imagePatterns = [
    /<img[^>]+(?:data-lazy-src|data-src|data-original)=["']([^"']+)["']/gi,
    /<img[^>]+srcset=["']([^"']+)["']/gi,
    /<img[^>]+src=["']([^"']+)["']/gi,
  ];

  for (const pattern of imagePatterns) {
    for (const match of html.matchAll(pattern)) {
      const raw = match[1]?.split(",").at(-1)?.trim().split(/\s+/)[0];
      const image = normaliseImageUrl(raw, sourceUrl);
      if (image && !isGenericImage(image)) return image;
    }
  }

  return null;
}

export async function cacheExternalRecipeImage(externalRecipeId: string) {
  const recipe = externalRecipes.find((item) => item.id === externalRecipeId);
  if (!recipe) return null;

  const cached = await readCachedRecipeImage(externalRecipeId);
  if (cached) {
    return `/api/recipes/local-image/${encodeURIComponent(externalRecipeId)}`;
  }

  const sourceUrl = new URL(sourceAliases.get(recipe.sourceUrl) ?? recipe.sourceUrl);
  let imageUrl = recipe.imageUrl;
  if (!imageUrl) {
    const pageResponse = await fetch(sourceUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; FoodRecipeImporter/1.0)",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-AU,en;q=0.9",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    if (!pageResponse.ok) return null;
    imageUrl = extractImageUrl(await pageResponse.text(), sourceUrl);
  }
  if (!imageUrl) return null;

  const imageResponse = await fetch(imageUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; FoodRecipeImporter/1.0)",
      Accept: "image/avif,image/webp,image/*,*/*;q=0.8",
      Referer: sourceUrl.toString(),
    },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const contentType = imageResponse.headers.get("content-type") ?? "";
  if (!imageResponse.ok || !contentType.startsWith("image/")) return null;

  const bytes = Buffer.from(await imageResponse.arrayBuffer());
  if (bytes.length === 0) return null;

  await mkdir(cacheDirectory, { recursive: true });
  await Promise.all([
    writeFile(path.join(cacheDirectory, `${externalRecipeId}.bin`), bytes),
    writeFile(
      path.join(cacheDirectory, `${externalRecipeId}.json`),
      JSON.stringify({ contentType, sourceUrl: recipe.sourceUrl, cachedAt: new Date().toISOString() }),
      "utf8",
    ),
  ]);

  return `/api/recipes/local-image/${encodeURIComponent(externalRecipeId)}`;
}

export async function readCachedRecipeImage(externalRecipeId: string) {
  const recipe = externalRecipes.find((item) => item.id === externalRecipeId);
  if (!recipe) return null;

  try {
    const [bytes, metadataText] = await Promise.all([
      readFile(path.join(cacheDirectory, `${externalRecipeId}.bin`)),
      readFile(path.join(cacheDirectory, `${externalRecipeId}.json`), "utf8"),
    ]);
    if (bytes.length === 0) return null;
    const metadata = JSON.parse(metadataText) as { contentType?: string };
    return { bytes, contentType: metadata.contentType ?? "application/octet-stream" };
  } catch {
    return null;
  }
}
