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

const storedPriceWindowMs = 35 * 24 * 60 * 60 * 1000;
const requestTimeoutMs = 5_500;
const searchConcurrency = 6;
const serpCircuitBreakerMs = 12 * 60 * 60 * 1000;

type CandidateSource = "food" | "open-prices" | "serpapi";
type Candidate = {
  retailer: SupermarketRetailer;
  productName: string;
  price: number;
  packSize: string | null;
  isSpecial: boolean;
  sourceUrl: string | null;
  cached: boolean;
  source: CandidateSource;
};
type SearchableItem = {
  item: SupermarketShoppingItem;
  productId: string | null;
  barcode: string | null;
};
type SearchRequestBody = {
  allowSubstitutes?: unknown;
  currentLocation?: unknown;
  location?: unknown;
};
type SerpResult = {
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
type SerpResponse = {
  shopping_results?: unknown;
  inline_shopping_results?: unknown;
  error?: unknown;
};
type OpenPrice = {
  price?: unknown;
  currency?: unknown;
  product_name?: unknown;
  price_is_discounted?: unknown;
  location_osm_display_name?: unknown;
  location?: { osm_display_name?: unknown; name?: unknown } | null;
};
type PriceGlobal = typeof globalThis & { foodSerpDisabledUntil?: number };
const priceGlobal = globalThis as PriceGlobal;

function clean(value: unknown) {
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

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function numeric(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(clean(value).replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function packSize(value: string) {
  return value.match(/\b\d+(?:\.\d+)?\s*(?:kg|g|l|ml|pack|pk|pieces?|cans?|bottles?|rolls?)\b/i)?.[0] ?? null;
}

function retailer(value: unknown): SupermarketRetailer | null {
  const source = normalise(clean(value));
  if (source.includes("woolworths")) return "Woolworths";
  if (source.includes("coles")) return "Coles";
  if (source === "aldi" || source.includes("aldi australia")) return "ALDI";
  if (source === "iga" || source.includes("iga australia") || source.includes("independent grocers")) return "IGA";
  if (source.includes("drakes") || source.includes("drake supermarkets")) return "Drakes";
  if (source.includes("costco")) return "Costco";
  return null;
}

function currentLocation(value: unknown): CurrentSearchLocation | null {
  if (!value || typeof value !== "object") return null;
  const location = value as Record<string, unknown>;
  if (
    typeof location.latitude !== "number" || !Number.isFinite(location.latitude) ||
    typeof location.longitude !== "number" || !Number.isFinite(location.longitude)
  ) return null;
  return {
    latitude: location.latitude,
    longitude: location.longitude,
    accuracy: typeof location.accuracy === "number" && Number.isFinite(location.accuracy)
      ? location.accuracy
      : null,
  };
}

function matchScore(query: string, productName: string, allowSubstitutes: boolean) {
  const requested = normalise(query);
  const candidate = normalise(productName);
  if (candidate === requested) return { score: 1000, exact: true };
  if (candidate.includes(requested)) return { score: 900, exact: true };
  const queryTokens = requested.split(" ").filter((token) => token.length > 1);
  const productTokens = new Set(candidate.split(" "));
  const ratio = queryTokens.length
    ? queryTokens.filter((token) => productTokens.has(token)).length / queryTokens.length
    : 0;
  if (ratio >= 0.8) return { score: 700 + ratio * 100, exact: true };
  if (!allowSubstitutes || ratio < 0.5) return null;
  return { score: 400 + ratio * 100, exact: false };
}

async function storedCandidates(searchItem: SearchableItem, query: string): Promise<Candidate[]> {
  const cutoff = new Date(Date.now() - storedPriceWindowMs);
  const candidates: Candidate[] = [];

  if (searchItem.productId) {
    const [observations, prices] = await Promise.all([
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

    for (const observation of observations) {
      const sourceRetailer = retailer(observation.retailer);
      if (!sourceRetailer || observation.price <= 0) continue;
      candidates.push({
        retailer: sourceRetailer,
        productName: query,
        price: observation.price,
        packSize: null,
        isSpecial: observation.isSpecial,
        sourceUrl: observation.sourceUrl,
        cached: true,
        source: "food",
      });
    }
    for (const price of prices) {
      const sourceRetailer = retailer(price.retailer);
      if (!sourceRetailer || price.price <= 0) continue;
      candidates.push({
        retailer: sourceRetailer,
        productName: price.productName,
        price: price.price,
        packSize: price.packSize,
        isSpecial: price.isSpecial,
        sourceUrl: null,
        cached: true,
        source: "food",
      });
    }
  }

  if (candidates.length) return candidates;

  const nameMatches = await prisma.supermarketPrice.findMany({
    where: {
      productName: { contains: query, mode: "insensitive" },
      checkedAt: { gte: cutoff },
    },
    orderBy: { checkedAt: "desc" },
    take: 50,
  });

  return nameMatches.flatMap((price): Candidate[] => {
    const sourceRetailer = retailer(price.retailer);
    if (!sourceRetailer || price.price <= 0) return [];
    return [{
      retailer: sourceRetailer,
      productName: price.productName,
      price: price.price,
      packSize: price.packSize,
      isSpecial: price.isSpecial,
      sourceUrl: null,
      cached: true,
      source: "food",
    }];
  });
}

async function openPricesCandidates(barcode: string, query: string): Promise<Candidate[]> {
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
    const payload = await response.json().catch(() => ({})) as { results?: unknown };
    const results = Array.isArray(payload.results) ? payload.results as OpenPrice[] : [];
    return results.flatMap((result): Candidate[] => {
      const sourceRetailer = retailer(
        result.location_osm_display_name ?? result.location?.osm_display_name ?? result.location?.name,
      );
      const price = numeric(result.price);
      if (!sourceRetailer || price === null || clean(result.currency).toUpperCase() !== "AUD") return [];
      const productName = clean(result.product_name) || query;
      return [{
        retailer: sourceRetailer,
        productName,
        price,
        packSize: packSize(productName),
        isSpecial: result.price_is_discounted === true,
        sourceUrl: null,
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

function quotaError(message: string) {
  const value = message.toLocaleLowerCase("en-AU");
  return value.includes("run out of searches")
    || value.includes("quota")
    || value.includes("searches left")
    || value.includes("monthly searches");
}

async function serpCandidates(query: string): Promise<Candidate[]> {
  if (process.env.FOOD_DISABLE_SERPAPI_PRICES === "1") return [];
  if ((priceGlobal.foodSerpDisabledUntil ?? 0) > Date.now()) return [];
  const apiKey = process.env.SERPAPI_API_KEY?.trim();
  if (!apiKey) return [];

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
    const payload = await response.json().catch(() => ({})) as SerpResponse;
    const error = clean(payload.error);
    if (!response.ok || error) {
      if (quotaError(error)) priceGlobal.foodSerpDisabledUntil = Date.now() + serpCircuitBreakerMs;
      return [];
    }

    const results = [
      ...(Array.isArray(payload.shopping_results) ? payload.shopping_results : []),
      ...(Array.isArray(payload.inline_shopping_results) ? payload.inline_shopping_results : []),
    ] as SerpResult[];

    return results.flatMap((result): Candidate[] => {
      const sourceRetailer = retailer(result.source ?? result.seller ?? result.merchant);
      const productName = clean(result.title);
      const price = numeric(result.extracted_price ?? result.price);
      if (!sourceRetailer || !productName || price === null) return [];
      const extensions = Array.isArray(result.extensions) ? result.extensions.map(clean).filter(Boolean) : [];
      const rawUrl = result.product_link ?? result.link;
      return [{
        retailer: sourceRetailer,
        productName,
        price,
        packSize: packSize([productName, ...extensions].join(" ")),
        isSpecial: normalise(extensions.join(" ")).includes("special"),
        sourceUrl: typeof rawUrl === "string" && rawUrl.trim() ? rawUrl.trim() : null,
        cached: false,
        source: "serpapi",
      }];
    });
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

function buildMatches(
  item: SupermarketShoppingItem,
  query: string,
  candidates: Candidate[],
  allowSubstitutes: boolean,
) {
  const scored = candidates
    .map((candidate) => {
      const assessment = matchScore(query, candidate.productName, allowSubstitutes);
      if (!assessment) return null;
      const match: LiveGroceryPriceMatch = {
        retailer: candidate.retailer,
        productName: candidate.productName,
        price: candidate.price,
        estimatedTotal: money(candidate.price),
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
      return { match, score: assessment.score };
    })
    .filter((entry): entry is { match: LiveGroceryPriceMatch; score: number } => entry !== null)
    .sort((left, right) => right.score - left.score || left.match.price - right.match.price);

  return supermarketRetailers
    .map((name) => scored.find((entry) => entry.match.retailer === name)?.match ?? null)
    .filter((match): match is LiveGroceryPriceMatch => match !== null)
    .sort((left, right) => left.estimatedTotal - right.estimatedTotal);
}

async function mapWithConcurrency<T, R>(values: T[], concurrency: number, mapper: (value: T) => Promise<R>) {
  const results = new Array<R>(values.length);
  let next = 0;
  async function worker() {
    while (true) {
      const index = next++;
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
  return sources.has("serpapi") ? "SerpApi Google Shopping" : "Food Price Engine";
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

  const location = currentLocation(body.currentLocation);
  const requestedLocation = location ?? (typeof body.location === "string" ? body.location : null);
  const resolvedLocation = await resolveUserSearchLocation(session.user.id, requestedLocation);
  const allowSubstitutes = body.allowSubstitutes !== false;

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
  if (!list) return NextResponse.json({ status: "error", error: "Shopping list not found." }, { status: 404 });

  const searchItems: SearchableItem[] = list.items.map((entry) => ({
    item: {
      id: entry.id,
      name: titleCase(entry.name),
      quantity: entry.quantity,
      unit: entry.unit,
    },
    productId: entry.productId,
    barcode: entry.product?.barcode ?? null,
  }));

  const sources = new Set<CandidateSource>();
  let cachedItemCount = 0;
  let liveItemCount = 0;

  const items = await mapWithConcurrency(searchItems, searchConcurrency, async (entry): Promise<LiveGroceryPriceItemResult> => {
    const query = titleCase(entry.item.name);
    let candidates = await storedCandidates(entry, query);
    if (!candidates.length && entry.barcode) candidates = await openPricesCandidates(entry.barcode, query);
    if (!candidates.length) candidates = await serpCandidates(query);

    for (const candidate of candidates) sources.add(candidate.source);
    if (candidates.some((candidate) => candidate.cached)) cachedItemCount += 1;
    else if (candidates.length) liveItemCount += 1;

    const matches = buildMatches(entry.item, query, candidates, allowSubstitutes);
    return {
      item: entry.item,
      query,
      matches,
      best: matches[0] ?? null,
      error: null,
    };
  });

  const retailerTotals = supermarketRetailers.map((name) => {
    const matches = items
      .map((item) => item.matches.find((match) => match.retailer === name))
      .filter((match): match is LiveGroceryPriceMatch => Boolean(match));
    return {
      retailer: name,
      total: money(matches.reduce((sum, match) => sum + match.estimatedTotal, 0)),
      matchedCount: matches.length,
      missingCount: items.length - matches.length,
    };
  });

  const unmatched = items.filter((item) => !item.best).length;
  const serpDisabled = (priceGlobal.foodSerpDisabledUntil ?? 0) > Date.now()
    || process.env.FOOD_DISABLE_SERPAPI_PRICES === "1";

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
    splitTotal: money(items.reduce((sum, item) => sum + (item.best?.estimatedTotal ?? 0), 0)),
    splitMatchedCount: items.filter((item) => item.best).length,
    liveItemCount,
    cachedItemCount,
    warning: unmatched
      ? serpDisabled
        ? `SerpApi is unavailable, so Food used saved prices and Open Prices. ${unmatched} item${unmatched === 1 ? "" : "s"} had no available price.`
        : `${unmatched} item${unmatched === 1 ? "" : "s"} had no available price.`
      : null,
  };

  return NextResponse.json(response, { headers: { "Cache-Control": "no-store" } });
}
