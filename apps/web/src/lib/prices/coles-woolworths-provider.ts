import type { SupermarketRetailer } from "./supermarket-comparison.types";

export type RetailerPriceCandidate = {
  retailer: Extract<SupermarketRetailer, "Coles" | "Woolworths">;
  productName: string;
  price: number;
  packSize: string | null;
  isSpecial: boolean;
  sourceUrl: string | null;
};

const timeoutMs = 7_000;

function clean(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function numeric(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  const parsed = Number(clean(value).replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function detectPackSize(...values: unknown[]) {
  const text = values.map(clean).filter(Boolean).join(" ");
  return text.match(/\b\d+(?:\.\d+)?\s*(?:kg|g|l|ml|pack|pk|pieces?|capsules?|tablets?|cans?|bottles?|rolls?)\b/i)?.[0] ?? null;
}

async function fetchJson(url: URL, headers: HeadersInit = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126 Safari/537.36 Food/0.1",
        ...headers,
      },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    return await response.json().catch(() => null) as unknown;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function woolworthsProducts(payload: unknown): RetailerPriceCandidate[] {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;
  const groups = Array.isArray(root.Products) ? root.Products : [];
  const products: Record<string, unknown>[] = [];

  for (const group of groups) {
    if (!group || typeof group !== "object") continue;
    const record = group as Record<string, unknown>;
    const nested = Array.isArray(record.Products) ? record.Products : null;
    if (nested) {
      for (const item of nested) {
        if (item && typeof item === "object") products.push(item as Record<string, unknown>);
      }
    } else if (record.Stockcode || record.DisplayName || record.Name) {
      products.push(record);
    }
  }

  return products.flatMap((product): RetailerPriceCandidate[] => {
    const productName = clean(product.DisplayName ?? product.Name);
    const price = numeric(product.Price ?? product.InstorePrice ?? product.WasPrice);
    if (!productName || price === null) return [];
    const wasPrice = numeric(product.WasPrice);
    const stockCode = clean(product.Stockcode);
    return [{
      retailer: "Woolworths",
      productName,
      price,
      packSize: detectPackSize(product.PackageSize, product.CupString, productName),
      isSpecial: Boolean(wasPrice && wasPrice > price),
      sourceUrl: stockCode ? `https://www.woolworths.com.au/shop/productdetails/${encodeURIComponent(stockCode)}` : null,
    }];
  });
}

function colesProducts(payload: unknown): RetailerPriceCandidate[] {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;
  const results = Array.isArray(root.results) ? root.results : [];

  return results.flatMap((entry): RetailerPriceCandidate[] => {
    if (!entry || typeof entry !== "object") return [];
    const product = entry as Record<string, unknown>;
    const pricing = product.pricing && typeof product.pricing === "object"
      ? product.pricing as Record<string, unknown>
      : {};
    const productName = clean(product.name ?? product.description);
    const price = numeric(pricing.now ?? pricing.was);
    if (!productName || price === null) return [];
    const wasPrice = numeric(pricing.was);
    const slug = clean(product.url ?? product.slug);
    return [{
      retailer: "Coles",
      productName,
      price,
      packSize: detectPackSize(product.packageSize, product.quantity, product.size, productName),
      isSpecial: Boolean(wasPrice && wasPrice > price),
      sourceUrl: slug
        ? (slug.startsWith("http") ? slug : `https://www.coles.com.au${slug.startsWith("/") ? "" : "/"}${slug}`)
        : null,
    }];
  });
}

async function searchWoolworths(query: string) {
  if (process.env.FOOD_DISABLE_WOOLWORTHS_API === "1") return [];
  const url = new URL("https://www.woolworths.com.au/apis/ui/Search/products");
  url.searchParams.set("searchTerm", query);
  const payload = await fetchJson(url);
  return woolworthsProducts(payload);
}

async function searchColes(query: string) {
  if (process.env.FOOD_DISABLE_COLES_API === "1") return [];
  const apiKey = process.env.COLES_API_KEY?.trim();
  if (!apiKey) return [];
  const url = new URL("https://www.coles.com.au/api/bff/products/search");
  url.searchParams.set("storeId", process.env.COLES_STORE_ID?.trim() || "0584");
  url.searchParams.set("searchTerm", query);
  url.searchParams.set("start", "0");
  url.searchParams.set("sortBy", "salesDescending");
  url.searchParams.set("excludeAds", "true");
  url.searchParams.set("authenticated", "false");
  url.searchParams.set("subscription-key", apiKey);
  const payload = await fetchJson(url);
  return colesProducts(payload);
}

export async function searchColesAndWoolworths(query: string) {
  const [woolworths, coles] = await Promise.all([
    searchWoolworths(query),
    searchColes(query),
  ]);
  return [...woolworths, ...coles];
}
