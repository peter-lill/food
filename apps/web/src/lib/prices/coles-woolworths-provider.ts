import { searchGroceryProviders } from "./providers/registry";
import type { SupermarketRetailer } from "./supermarket-comparison.types";

export type RetailerCatalogueCandidate = {
  retailer: Extract<SupermarketRetailer, "Coles" | "Woolworths">;
  productName: string;
  price: number | null;
  packSize: string | null;
  isSpecial: boolean;
  sourceUrl: string | null;
  externalId: string | null;
  barcode: string | null;
  imageUrl: string | null;
};

export type RetailerPriceCandidate = Omit<RetailerCatalogueCandidate, "price"> & {
  price: number;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function detectPackSize(...values: unknown[]) {
  const text = values.map(clean).filter(Boolean).join(" ");
  return text.match(/\b\d+(?:\.\d+)?\s*(?:kg|g|l|ml|pack|pk|pieces?|capsules?|tablets?|cans?|bottles?|rolls?)\b/i)?.[0] ?? null;
}

function slugify(value: string) {
  return value
    .toLocaleLowerCase("en-AU")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function retailerProductUrl(
  retailer: Extract<SupermarketRetailer, "Coles" | "Woolworths">,
  productName: string,
  externalId: string | null,
) {
  if (!externalId) return null;
  if (retailer === "Woolworths") {
    return `https://www.woolworths.com.au/shop/productdetails/${encodeURIComponent(externalId)}`;
  }
  const slug = slugify(productName) || "product";
  return `https://www.coles.com.au/product/${slug}-${encodeURIComponent(externalId)}`;
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function safeHttpsImage(value: string | null | undefined) {
  if (!value) return null;
  try {
    const parsed = new URL(decodeHtml(value.trim()));
    return parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function extractPageImage(html: string) {
  const metaPatterns = [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["'][^>]*>/i,
    /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image(?::src)?["'][^>]*>/i,
  ];
  for (const pattern of metaPatterns) {
    const image = safeHttpsImage(html.match(pattern)?.[1]);
    if (image) return image;
  }

  const jsonImage = html.match(/"image"\s*:\s*"(https?:[^"\\]+(?:\\.[^"\\]*)*)"/i)?.[1];
  if (jsonImage) {
    const image = safeHttpsImage(jsonImage.replace(/\\\//g, "/").replace(/\\u0026/g, "&"));
    if (image) return image;
  }

  return null;
}

async function fetchRetailerPageImage(url: string | null) {
  if (!url) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(url, {
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-AU,en;q=0.9",
        "User-Agent": "Mozilla/5.0 (compatible; FoodCatalogue/0.1; +https://food.coffeehq.coffee)",
      },
    });
    if (!response.ok) return null;
    return extractPageImage(await response.text());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function hydrateCatalogueImage(candidate: RetailerCatalogueCandidate) {
  if (candidate.imageUrl) return candidate;
  const imageUrl = await fetchRetailerPageImage(candidate.sourceUrl);
  return imageUrl ? { ...candidate, imageUrl } : candidate;
}

export async function searchColesAndWoolworthsCatalogue(query: string): Promise<RetailerCatalogueCandidate[]> {
  const { results, errors } = await searchGroceryProviders(query, {
    limit: 15,
    storeId: process.env.COLES_STORE_ID?.trim() || null,
  });

  if (errors.length) {
    console.warn("Grocery provider catalogue search completed with errors", errors);
  }

  const candidates = results.flatMap((result): RetailerCatalogueCandidate[] => {
    if (
      (result.retailer !== "Coles" && result.retailer !== "Woolworths")
      || !result.name.trim()
    ) return [];

    const externalId = clean(result.productId) || null;
    return [{
      retailer: result.retailer,
      productName: result.name.trim(),
      price: result.price,
      packSize: detectPackSize(result.name, result.unit),
      isSpecial: false,
      sourceUrl: retailerProductUrl(result.retailer, result.name.trim(), externalId),
      externalId,
      barcode: clean(result.barcode) || null,
      imageUrl: clean(result.imageUrl) || null,
    }];
  });

  return Promise.all(candidates.map(hydrateCatalogueImage));
}

export async function searchColesAndWoolworths(query: string): Promise<RetailerPriceCandidate[]> {
  const results = await searchColesAndWoolworthsCatalogue(query);

  return results.flatMap((result): RetailerPriceCandidate[] => {
    const hasUsablePrice = result.price !== null && Number.isFinite(result.price) && result.price > 0;
    const hasCatalogueImage = Boolean(result.imageUrl);
    if (!hasUsablePrice && !hasCatalogueImage) return [];

    return [{
      ...result,
      price: hasUsablePrice ? result.price as number : Number.NaN,
    }];
  });
}
