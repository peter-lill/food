import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  resolveUserSearchLocation,
  type CurrentSearchLocation,
} from "@/lib/location-preferences";
import { prisma } from "@/lib/prisma";
import {
  supermarketRetailers,
  type SupermarketRetailer,
  type SupermarketShoppingItem,
} from "@/lib/prices/supermarket-comparison.types";
import type {
  GroceryPriceProvider,
  LiveGroceryPriceItemResult,
  LiveGroceryPriceMatch,
  LiveGroceryPriceSearchResponse,
} from "@/lib/prices/live-grocery-price.types";

export const runtime = "nodejs";
export const maxDuration = 120;

const memoryCacheWindowMs = 6 * 60 * 60 * 1000;
const storedPriceWindowMs = 35 * 24 * 60 * 60 * 1000;
const requestTimeoutMs = 5_500;
const searchConcurrency = 6;
const serpCircuitBreakerMs = 12 * 60 * 60 * 1000;

type SearchRequestBody = {
  allowSubstitutes?: unknown;
  currentLocation?: unknown;
  location?: unknown;
};

type CandidateSource = "food" | "open-prices" | "serpapi";

type Candidate = {
  retailer: SupermarketRetailer;
  productName: string;
  price: number;
  packSize: string | null;
  isSpecial: boolean;
  sourceUrl: string | null;
  rank: number;
  cached: boolean;
  source: CandidateSource;
};

type SearchableItem = {
  item: SupermarketShoppingItem;
  productId: string | null;
  barcode: string | null;
};

type SearchResult = {
  candidates: Candidate[];
  source: CandidateSource | null;
  cached: boolean;
  error: string | null;
};

type CacheEntry = {
  expiresAt: number;
  candidates: Candidate[];
};

type SerpShoppingResult = {
  title?: unknown;
  source?: unknown;
  seller?: unknown;
  merchant?: unknown;
  price?: unknown;
  extracted_price?: unknown;
  link?: unknown;
  product_link?: unknown;
  extensions?: unknown;
};

type SerpApiResponse = {
  shopping_results?: unknown;
  inline_shopping_results?: unknown;
  error?: unknown;
};

type OpenPricesResult = {
  price?: unknown;
  currency?: unknown;
  product_name?: unknown;
  price_is_discounted?: unknown;
  location_osm_display_name?: unknown;
  location?: {
    osm_display_name?: unknown;
    name?: unknown;
  } | null;
};

type OpenPricesResponse = {
  results?: unknown;
};

type PriceSearchGlobal = typeof globalThis & {
  foodGroceryPriceSearchCache?: Map<string, CacheEntry>;
  foodSerpDisabledUntil?: number;
};

const priceSearchGlobal = globalThis as PriceSearchGlobal;
const priceSearchCache = priceSearchGlobal.foodGroceryPriceSearchCache ?? new Map<string, CacheEntry>();
priceSearchGlobal.foodGroceryPriceSearchCache = priceSearchCache;

function cleanText(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function normalise(value: string) {
  return value
    .toLocaleLowerCase("en-AU")
    .replace(/&/g, " and ")
    .replace(/[-_/]+/g, " ")
    .replace(/[^a-z0-9.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCase(value: string) {
  return value
    .toLocaleLowerCase("en-AU")
    .replace(/\b\w/g, (letter) => letter.toLocaleUpperCase("en-AU"));
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function numeric(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(cleanText(value).replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function currentLocationFromRequest(value: unknown): CurrentSearchLocation | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.latitude !== "number" ||
    !Number.isFinite(candidate.latitude) ||
    typeof candidate.longitude !== "number" ||
    !Number.isFinite(candidate.longitude)
  ) return null;

  return {
    latitude: candidate.latitude,
    longitude: candidate.longitude,
    accuracy: typeof candidate.accuracy === "number" && Number.isFinite(candidate.accuracy)
      ? candidate.accuracy
      : null,
  };
}

function sourceRetailer(value: unknown): SupermarketRetailer | null {
  const source = normalise(cleanText(value));
  if (source.includes("woolworths")) return "Woolworths";
  if (source.includes("coles")) return "Coles";
  if (source === "aldi" || source.includes("aldi australia")) return "ALDI";
  if (source === "iga" || source.includes("iga australia") || source.includes("independent grocers")) return "IGA";
  if (source.includes("drakes") || source.includes("drake supermarkets")) return "Drakes";
  if (source.includes("costco")) return "Costco";
  return null;
}

function packSize(value: string) {
  return value.match(/\b\d+(?:\.\d+)?\s*(?:kg|g|l|ml|pack|pk|pieces?|cans?|bottles?|rolls?)\b/i)?.[0] ?? null;
}

function tokens(value: string) {
  const ignored = new Set(["and", "the", "with", "for", "from", "pack", "packet", "item", "items", "each", "of"]);
  return normalise(value)
    .split(" ")
    .filter((token) => token.length > 1 && !ignored.has(token) && !/^\d/.test(token));
}

function scoreMatch(query: string, productName: string, allowSubstitutes: boolean) {
  const queryValue = normalise(query);
  const productValue = normalise(productName);
  if (productValue === queryValue) return { score: 1_000, exact: true };
  if (productValue.includes(queryValue)) return { score: 900, exact: true };

  const requested = tokens(queryValue);
  const product = new Set(tokens(productValue));
  const matched = requested.filter((token) => product.has(token)).length;
  const ratio = requested.length ? matched / requested.length : 0;
  if (ratio >= 0.8) return { score: 700 + ratio * 100, exact: true };
  if (!allowSubstitutes || ratio < 0.5) return null;
  return { score: 400 + ratio * 100, exact: false };
}

function cacheKey(query: string, barcode: string | null) {
  return `${normalise(query)}:${barcode ?? ""}`;
}

function cloneCandidates(candidates: Candidate[], cached: boolean) {
  return candidates.map((candidate) => ({ ...candidate, cached }));
}

async function searchStoredPrices(searchItem: SearchableItem, query: string): Promise<Candidate[]> {
  const cutoff = new Date(Date.now() - storedPriceWindowMs);

  if (searchItem.productId) {
    const [observations, cataloguePrices] = await Promise.all([
      prisma.priceObservation.findMany({
        where: { productId: searchItem.productId, observedAt: { gte: cutoff } },
        orderBy: { observedAt: "desc" },
        take: 80,
      }),
      prisma.supermarketPrice.findMany({
        where: { productId: searchItem.productId, checkedAt: { gte: cutoff } },
        orderBy: { checkedAt: "desc" },
        take: 80,
      }),
    ]);

    const candidates: Candidate[] = [];
    observations.forEach((observation, rank) => {
      const retailer = sourceRetailer(observation.retailer);
      if (!retailer || observation.price <= 0) return;
      candidates.push({
        retailer,
        productName: query,
        price: observation.price,
        packSize: null,
        isSpecial: observation.isSpecial,
        sourceUrl: observation.sourceUrl,
        rank,
        cached: true,
        source: "food",
      });
    });
    cataloguePrices.forEach((price, index) => {
      const retailer = sourceRetailer(price.retailer);
      if (!retailer || price.price <= 0) return;
      candidates.push({
        retailer,
        productName: price.productName,
        price: price.price,
        packSize: price.packSize,
        isSpecial: price.isSpecial,
        sourceUrl: null,
        rank: observations.length + index,
        cached: true,
        source: "food",
      });
    });
    if (candidates.length) return candidates;
  }

  const nameMatches = await prisma.supermarketPrice.findMany({
    where: {
      productName: { contains: query, mode: "insensitive" },
      checkedAt: { gte: cutoff },
    },
    orderBy: { checkedAt: "desc" },
    take: 50,
  });

  return nameMatches.flatMap((price, rank): Candidate[] => {
    const retailer = sourceRetailer(price.retailer);
    if (!retailer || price.price <= 0) return [];
    return [{
      retailer,
      productName: price.productName,
      price: price.price,
      packSize: price.packSize,
      isSpecial: price.isSpecial,
      sourceUrl: null,
      rank,
      cached: true,
      source: "food",
    }];
  });
}

async function searchOpenPrices(barcode: string, query: string): Promise<Candidate[]> {
  const url = new URL("https://prices.openfoodfacts.org/api/v1/prices");
  url.searchParams.set("product_code", barcode);
  url.searchParams.set("currency", "AUD");
  url.searchParams.set("ordering", "-date");
  url.searchParams.set("page_size", "50");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
      headers: { "User-Agent": "Food/0.1 (https://food.coffeehq.coffee)" },
    });
    if (!response.ok) return [];
    const payload = await response.json().catch(() => ({})) as OpenPricesResponse;
    const results = Array.isArray(payload.results) ? payload.results as OpenPricesResult[] : [];

    return results.flatMap((result, rank): Candidate[] => {
      const retailer = sourceRetailer(
        result.location_osm_display_name ?? result.location?.osm_display_name ?? result.location?.name,
      );
      const price = numeric(result.price);
      if (!retailer || price === null || cleanText(result.currency).toUpperCase() !== "AUD") return [];
      const productName = cleanText(result.product_name) || query;
      return [{
        retailer,
        productName,
        price,
        packSize: packSize(productName),
        isSpecial: result.price_is_discounted === true,
        sourceUrl: null,
        rank,
        cached: false,
        source: "open-prices",
      }];
    });
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

function serpQuotaError(message: string) {
  const value = message.toLocaleLowerCase("en-AU");
  return value.includes("run out of searches") || value.includes("quota") || value.includes("searches left");
}

async function searchSerpApi(query: string, key: string): Promise<Candidate[]> {
  const disabledUntil = priceSearchGlobal.foodSerpDisabledUntil ?? 0;
  if (disabledUntil > Date.now()) {
    throw new Error("SerpApi quota is temporarily unavailable.");
  }

  const apiKey = process.env.SERPAPI_API_KEY?.trim();
  if (!apiKey) throw new Error("SerpApi is not configured.");

  const cached = priceSearchCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cloneCandidates(cached.candidates, true);

  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google_shopping");
  url.searchParams.set("q", query);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("gl", "au");
  url.searchParams.set("hl", "en");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const response = await fetch(url, { cache: "no-store", signal: controller.signal });
    const payload = await response.json().catch(() => ({})) as SerpApiResponse;
    const apiError = cleanText(payload.error);

    if (!response.ok || apiError) {
      const detail = apiError || `SerpApi returned HTTP ${response.status}.`;
      if (serpQuotaError(detail)) {
        priceSearchGlobal.foodSerpDisabledUntil = Date.now() + serpCircuitBreakerMs;
      }
      if (cached?.candidates.length) return cloneCandidates(cached.candidates, true);
      throw new Error(detail);
    }

    const rawResults = [
      ...(Array.isArray(payload.shopping_results) ? payload.shopping_results : []),
      ...(Array.isArray(payload.inline_shopping_results) ? payload.inline_shopping_results : []),
    ] as SerpShoppingResult[];

    const candidates = rawResults.flatMap((result, rank): Candidate[] => {
      const retailer = sourceRetailer(result.source ?? result.seller ?? result.merchant);
      const productName = cleanText(result.title);
      const price = numeric(result.extracted_price ?? result.price);
      if (!retailer || !productName || price === null) return [];
      const extensions = Array.isArray(result.extensions) ? result.extensions.map(cleanText).filter(Boolean) : [];
      const extensionText = normalise(extensions.join(" "));
      const rawUrl = result.product_link ?? result.link;
      return [{
        retailer,
        productName,
        price,
        packSize: packSize([productName, ...extensions].join(" ")),
        isSpecial: extensionText.includes("special") || extensionText.includes("sale") || extensionText.includes("save "),
        sourceUrl: typeof rawUrl === "string" && rawUrl.trim() ? rawUrl.trim() : null,
        rank,
        cached: false,
        source: "serpapi",
      }];
    });

    priceSearchCache.set(key, {
      expiresAt: Date.now() + memoryCacheWindowMs,
      candidates: cloneCandidates(candidates, false),
    });
    return candidates;
  } catch (error) {
    if (cached?.candidates.length) return cloneCandidates(cached.candidates, true);
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("SerpApi timed out for this item.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function searchPriceEngine(searchItem: SearchableItem, query: string): Promise<SearchResult> {
  const key = cacheKey(query, searchItem.barcode);
  const memoryCached = priceSearchCache.get(key);
  if (memoryCached && memoryCached.expiresAt > Date.now()) {
    return { candidates: cloneCandidates(memoryCached.candidates, true), source: memoryCached.candidates[0]?.source ?? null, cached: true, error: null };
  }

  const stored = await searchStoredPrices(searchItem, query);
  if (stored.length) {
    priceSearchCache.set(key, { expiresAt: Date.now() + memoryCacheWindowMs, candidates: stored });
    return { candidates: stored, source: "food", cached: true, error: null };
  }

  if (searchItem.barcode) {
    const openPrices = await searchOpenPrices(searchItem.barcode, query);
    if (openPrices.length) {
      priceSearchCache.set(key, { expiresAt: Date.now() + memoryCacheWindowMs, candidates: openPrices });
      return { candidates: openPrices, source: "open-prices", cached: false, error: null };
    }
  }

  try {
    const serp = await searchSerpApi(query, key);
    return { candidates: serp, source: "serpapi", cached: serp.every((candidate) => candidate.cached), error: null };
  } catch (error) {
    return {
      candidates: [],
      source: null,
      cached: false,
      error: error instanceof Error ? error.message : "No price provider returned a result.",
    };
  }
}

function buildMatches(item: SupermarketShoppingItem, query: string, candidates: Candidate[], allowSubstitutes: boolean) {
  const scored = candidates
    .map((candidate) => {
      const assessment = scoreMatch(query, candidate.productName, allowSubstitutes);
      if (!assessment) return null;
      const match: LiveGroceryPriceMatch = {
        retailer: candidate.retailer,
        productName: candidate.productName,
        price: candidate.price,
        estimatedTotal: roundMoney(candidate.price),
        packSize: candidate.packSize,
        unitPrice: null,
        unitLabel: null,
        isSpecial: candidate.isSpecial,
        matchKind: assessment.exact ? "exact" : "substitute",
        matchReason: assessment.exact
          ? "Matches the requested product."
          : "Comparable product; check pack size and ingredients before buying.",
        sourceUrl: candidate.sourceUrl,
        cached: candidate.cached,
      };
      return { match, score: assessment.score, rank: candidate.rank };
    })
    .filter((entry): entry is { match: LiveGroceryPriceMatch; score: number; rank: number } => entry !== null)
    .sort((left, right) => right.score - left.score || left.match.price - right.match.price || left.rank - right.rank);

  return supermarketRetailers
    .map((retailer) => scored.find((entry) => entry.match.retailer === retailer)?.match ?? null)
    .filter((match): match is LiveGroceryPriceMatch => match !== null)
    .sort((left, right) => left.estimatedTotal - right.estimatedTotal);
}

async function mapWithConcurrency<T, R>(values: T[], concurrency: number, mapper: (value: T) => Promise<R>) {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  async function worker() {
    while (true) {
      const index = nextIndex++;
      if (index >= values.length) return;
      results[index] = await mapper(values[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
  return results;
}

function providerLabel(sources: Set<CandidateSource>): GroceryPriceProvider {
  if (sources.size > 1) return "Food Price Engine + Open Prices + SerpApi";
  if (sources.has("food")) return "Food Price Engine";
  if (sources.has("open-prices")) return "Open Prices";
  return "SerpApi Google Shopping";
}

export async function POST(request: Request, context: { params: Promise<{ listId: string }> }) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ status: "error", error: "Sign in to search current grocery prices." }, { status: 401 });
  }

  const { listId } = await context.params;
  let body: SearchRequestBody = {};
  try {
    body = await request.json() as SearchRequestBody;
  } catch {
    // Defaults are valid.
  }

  const allowSubstitutes = body.allowSubstitutes !== false;
  const currentLocation = currentLocationFromRequest(body.currentLocation);
  const requestedLocation = currentLocation ?? (typeof body.location === "string" ? body.location : null);
  const resolvedLocation = await resolveUserSearchLocation(session.user.id, requestedLocation);

  const list = await prisma.shoppingList.findUnique({
    where: { id: listId },
    include: {
      items: {
        where: { checked: false },
        orderBy: { id: "asc" },
        include: { product: { select: { id: true, barcode: true } } },
      },
    },
  });

  if (!list) {
    return NextResponse.json({ status: "error", error: "Shopping list not found." }, { status: 404 });
  }

  const searchItems: SearchableItem[] = list.items.map((item) => ({
    item: {
      id: item.id,
      name: titleCase(item.name),
      quantity: item.quantity,
      unit: item.unit,
    },
    productId: item.productId,
    barcode: item.product?.barcode ?? null,
  }));

  let liveItemCount = 0;
  let cachedItemCount = 0;
  const sources = new Set<CandidateSource>();

  const items = await mapWithConcurrency(searchItems, searchConcurrency, async (searchItem): Promise<LiveGroceryPriceItemResult> => {
    const query = titleCase(searchItem.item.name);
    const result = await searchPriceEngine(searchItem, query);
    if (result.source) sources.add(result.source);
    if (result.cached) cachedItemCount += 1;
    else if (result.candidates.length) liveItemCount += 1;

    const matches = buildMatches(searchItem.item, query, result.candidates, allowSubstitutes);
    return {
      item: searchItem.item,
      query,
      matches,
      best: matches[0] ?? null,
      error: result.error,
    };
  });

  const retailerTotals = supermarketRetailers.map((retailer) => {
    const matches = items
      .map((item) => item.matches.find((match) => match.retailer === retailer))
      .filter((match): match is LiveGroceryPriceMatch => Boolean(match));
    return {
      retailer,
      total: roundMoney(matches.reduce((sum, match) => sum + match.estimatedTotal, 0)),
      matchedCount: matches.length,
      missingCount: items.length - matches.length,
    };
  });

  const failedCount = items.filter((item) => item.error).length;
  const response: LiveGroceryPriceSearchResponse = {
    status: "success",
    provider: providerLabel(sources),
    listId,
    listName: list.name,
    location: resolvedLocation.label,
    locationSource: resolvedLocation.source,
    searchedAt: new Date().toISOString(),
    allowSubstitutes,
    items,
    retailerTotals,
    splitTotal: roundMoney(items.reduce((sum, item) => sum + (item.best?.estimatedTotal ?? 0), 0)),
    splitMatchedCount: items.filter((item) => item.best).length,
    liveItemCount,
    cachedItemCount,
    warning: failedCount
      ? `Searched all ${items.length} items using saved Food prices, Open Prices and available online providers. ${failedCount} item${failedCount === 1 ? "" : "s"} had no usable result.`
      : null,
  };

  return NextResponse.json(response, { headers: { "Cache-Control": "no-store" } });
}
