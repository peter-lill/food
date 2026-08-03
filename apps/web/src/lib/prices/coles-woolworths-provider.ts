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

const browserHeaders = {
  "Accept-Language": "en-AU,en;q=0.9",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36",
};

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
        ...browserHeaders,
        Accept: "text/html,application/xhtml+xml",
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

async function reachableImageUrl(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(url, {
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8",
        Referer: "https://www.woolworths.com.au/",
        ...browserHeaders,
      },
    });
    const contentType = response.headers.get("content-type")?.toLocaleLowerCase("en-AU") ?? "";
    return response.ok && contentType.startsWith("image/") ? url : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function resolveWoolworthsCdnImage(externalId: string) {
  const encodedId = encodeURIComponent(externalId);
  const candidates = [
    `https://cdn0.woolworths.media/content/wowproductimages/large/${encodedId}.jpg`,
    `https://cdn0.woolworths.media/content/wowproductimages/big/${encodedId}.jpg`,
    `https://cdn0.woolworths.media/content/wowproductimages/medium/${encodedId}.jpg`,
    `https://cdn0.woolworths.media/content/wowproductimages/large/${encodedId}_1.jpg`,
  ];

  for (const candidate of candidates) {
    const reachable = await reachableImageUrl(candidate);
    if (reachable) return reachable;
  }
  return null;
}

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : null;
}

function findFirstString(value: unknown, keys: string[]): string | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findFirstString(item, keys);
      if (found) return found;
    }
    return null;
  }

  const record = asRecord(value);
  if (!record) return null;
  const wanted = new Set(keys.map((key) => key.toLocaleLowerCase("en-AU")));

  for (const [key, item] of Object.entries(record)) {
    if (wanted.has(key.toLocaleLowerCase("en-AU"))) {
      const text = clean(item);
      if (text) return text;
    }
  }

  for (const item of Object.values(record)) {
    const found = findFirstString(item, keys);
    if (found) return found;
  }
  return null;
}

function collectImageStrings(value: unknown, found: string[] = []): string[] {
  if (typeof value === "string") {
    const decoded = value.replace(/\\\//g, "/").replace(/\\u0026/g, "&");
    if (/^https:\/\//i.test(decoded) && /(?:wowproductimages|woolworths\.media|\.(?:jpe?g|png|webp)(?:\?|$))/i.test(decoded)) {
      found.push(decoded);
    }
    return found;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectImageStrings(item, found);
    return found;
  }
  const record = asRecord(value);
  if (record) {
    for (const item of Object.values(record)) collectImageStrings(item, found);
  }
  return found;
}

function sessionCookies(response: Response) {
  const extendedHeaders = response.headers as Headers & { getSetCookie?: () => string[] };
  const values = extendedHeaders.getSetCookie?.() ?? [];
  if (!values.length) {
    const combined = response.headers.get("set-cookie");
    if (combined) values.push(combined);
  }
  return values
    .map((cookie) => cookie.split(";", 1)[0]?.trim())
    .filter((cookie): cookie is string => Boolean(cookie))
    .join("; ");
}

async function resolveWoolworthsDetailApi(externalId: string): Promise<RetailerCatalogueCandidate | null> {
  const sourceUrl = retailerProductUrl("Woolworths", "product", externalId);
  if (!sourceUrl) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const bootstrap = await fetch(sourceUrl, {
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        ...browserHeaders,
        Accept: "text/html,application/xhtml+xml",
      },
    });
    const cookie = sessionCookies(bootstrap);

    const response = await fetch(`https://www.woolworths.com.au/apis/ui/product/detail/${encodeURIComponent(externalId)}`, {
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        ...browserHeaders,
        Accept: "application/json, text/plain, */*",
        Referer: sourceUrl,
        "X-Requested-With": "XMLHttpRequest",
        ...(cookie ? { Cookie: cookie } : {}),
      },
    });
    if (!response.ok) return null;

    const data = await response.json() as unknown;
    const imageCandidates = [...new Set(collectImageStrings(data))]
      .sort((left, right) => {
        const leftExact = left.includes(`/${externalId}`) ? 1 : 0;
        const rightExact = right.includes(`/${externalId}`) ? 1 : 0;
        const leftLarge = /\/large\//i.test(left) ? 1 : 0;
        const rightLarge = /\/large\//i.test(right) ? 1 : 0;
        return (rightExact + rightLarge) - (leftExact + leftLarge);
      });

    let imageUrl: string | null = null;
    for (const candidate of imageCandidates) {
      const safe = safeHttpsImage(candidate);
      if (!safe) continue;
      imageUrl = await reachableImageUrl(safe);
      if (imageUrl) break;
    }

    const productName = findFirstString(data, ["Name", "ProductName", "DisplayName", "FullDescription"])
      ?? `Woolworths product ${externalId}`;
    const barcode = findFirstString(data, ["Barcode", "Ean", "EAN", "Gtin", "GTIN"]);
    const unit = findFirstString(data, ["CupString", "PackageSize", "Unit", "UnitDescription"]);
    const priceText = findFirstString(data, ["Price", "CurrentPrice"]);
    const parsedPrice = priceText ? Number(priceText.replace(/[^0-9.]/g, "")) : Number.NaN;

    return {
      retailer: "Woolworths",
      productName,
      price: Number.isFinite(parsedPrice) && parsedPrice > 0 ? parsedPrice : null,
      packSize: detectPackSize(productName, unit),
      isSpecial: false,
      sourceUrl,
      externalId,
      barcode,
      imageUrl,
    };
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

export function parseWoolworthsProductReference(value: string) {
  const input = value.trim();
  if (/^\d{4,12}$/.test(input)) return input;
  try {
    const url = new URL(input);
    if (!/(^|\.)woolworths\.com\.au$/i.test(url.hostname)) return null;
    return url.pathname.match(/\/shop\/productdetails\/(\d{4,12})/i)?.[1] ?? null;
  } catch {
    return null;
  }
}

export async function resolveWoolworthsProductReference(value: string): Promise<RetailerCatalogueCandidate | null> {
  const externalId = parseWoolworthsProductReference(value);
  if (!externalId) return null;

  const exactDetail = await resolveWoolworthsDetailApi(externalId);
  if (exactDetail?.imageUrl) return exactDetail;

  const results = await searchColesAndWoolworthsCatalogue(externalId);
  const exact = results.find((candidate) => (
    candidate.retailer === "Woolworths"
    && candidate.externalId?.replace(/\D/g, "") === externalId
  ));
  if (exact?.imageUrl) return exact;

  const sourceUrl = retailerProductUrl("Woolworths", exactDetail?.productName ?? exact?.productName ?? "product", externalId);
  const imageUrl = await resolveWoolworthsCdnImage(externalId)
    ?? exactDetail?.imageUrl
    ?? exact?.imageUrl
    ?? await fetchRetailerPageImage(sourceUrl);
  if (!imageUrl) return exactDetail ?? exact ?? null;

  return {
    retailer: "Woolworths",
    productName: exactDetail?.productName ?? exact?.productName ?? `Woolworths product ${externalId}`,
    price: exactDetail?.price ?? exact?.price ?? null,
    packSize: exactDetail?.packSize ?? exact?.packSize ?? null,
    isSpecial: exactDetail?.isSpecial ?? exact?.isSpecial ?? false,
    sourceUrl,
    externalId,
    barcode: exactDetail?.barcode ?? exact?.barcode ?? null,
    imageUrl,
  };
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
