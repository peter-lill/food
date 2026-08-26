import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  resolveUserSearchLocation,
  type CurrentSearchLocation,
} from "@/lib/location-preferences";
import { prisma } from "@/lib/prisma";
import { searchColesAndWoolworths } from "@/lib/prices/coles-woolworths-provider";
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
import { enabledRetailers as resolveEnabledRetailers, preferredStoreIds } from "@/lib/retailers/retailer-preferences";

export const runtime = "nodejs";
export const maxDuration = 120;

const cacheWindowMs = 6 * 60 * 60 * 1000;
const requestTimeoutMs = 5_500;
const searchConcurrency = 4;
const serpCircuitBreakerMs = 12 * 60 * 60 * 1000;

type CandidateSource = "food" | "open-prices" | "retailer-api" | "aldi-catalogue" | "serpapi";
type Candidate = {
  retailer: SupermarketRetailer;
  productName: string;
  price: number;
  packSize: string | null;
  barcode: string | null;
  isSpecial: boolean;
  sourceUrl: string | null;
  cached: boolean;
  source: CandidateSource;
  storeSpecific: boolean;
};
type SearchableItem = {
  item: SupermarketShoppingItem;
  productId: string | null;
  barcode: string | null;
  productName: string | null;
  canonicalName: string | null;
  brand: string | null;
  packSize: string | null;
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
  return value.match(/\b\d+(?:\.\d+)?\s*(?:kg|g|l|ml|pack|pk|pieces?|capsules?|tablets?|cans?|bottles?|rolls?)\b/i)?.[0] ?? null;
}

function normalisedPack(value: string | null) {
  if (!value) return null;
  const match = normalise(value).match(/(\d+(?:\.\d+)?)\s*(kg|g|l|ml|pack|pk|piece|pieces|capsule|capsules|tablet|tablets|can|cans|bottle|bottles|roll|rolls)/);
  if (!match) return normalise(value);
  let amount = Number(match[1]);
  let unit = match[2];
  if (unit === "kg") { amount *= 1000; unit = "g"; }
  if (unit === "l") { amount *= 1000; unit = "ml"; }
  if (["pk", "pieces", "piece"].includes(unit)) unit = "pack";
  if (unit.endsWith("s")) unit = unit.slice(0, -1);
  return `${amount}${unit}`;
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

function searchQueries(entry: SearchableItem) {
  const rich = [entry.brand, entry.canonicalName ?? entry.productName, entry.packSize]
    .map(clean)
    .filter(Boolean)
    .join(" ");
  return [...new Set([
    entry.barcode,
    rich,
    entry.canonicalName,
    entry.productName,
    entry.item.name,
  ].map(clean).filter(Boolean))].slice(0, 4);
}

function matchScore(entry: SearchableItem, query: string, candidate: Candidate, allowSubstitutes: boolean) {
  const expectedBarcode = clean(entry.barcode).replace(/\D/g, "");
  const candidateBarcode = clean(candidate.barcode).replace(/\D/g, "");
  if (expectedBarcode && candidateBarcode && expectedBarcode === candidateBarcode) {
    return { score: 10_000, exact: true, reason: "Exact barcode match." };
  }
  if (expectedBarcode && candidateBarcode && expectedBarcode !== candidateBarcode) return null;

  const requested = normalise(entry.canonicalName ?? entry.productName ?? query);
  const candidateName = normalise(candidate.productName);
  const queryTokens = requested.split(" ").filter((token) => token.length > 1);
  const productTokens = new Set(candidateName.split(" "));
  const ratio = queryTokens.length
    ? queryTokens.filter((token) => productTokens.has(token)).length / queryTokens.length
    : 0;

  const expectedBrand = normalise(entry.brand ?? "");
  if (expectedBrand && !candidateName.includes(expectedBrand)) {
    if (!allowSubstitutes) return null;
  }

  const expectedPack = normalisedPack(entry.packSize ?? packSize(entry.item.name));
  const candidatePack = normalisedPack(candidate.packSize ?? packSize(candidate.productName));
  const packMatches = !expectedPack || !candidatePack || expectedPack === candidatePack;
  if (!packMatches && !allowSubstitutes) return null;

  if (candidateName === requested) return { score: 1_000 + (packMatches ? 80 : 0), exact: true, reason: "Exact product name match." };
  if (candidateName.includes(requested) && ratio >= 0.8) {
    return { score: 900 + ratio * 50 + (packMatches ? 50 : -100), exact: packMatches, reason: packMatches ? "Product name and pack size match." : "Product name matches; pack size differs." };
  }
  if (ratio >= 0.75 && packMatches) return { score: 750 + ratio * 100, exact: true, reason: "Strong product and pack-size match." };
  if (!allowSubstitutes || ratio < 0.45) return null;
  return { score: 400 + ratio * 100 + (packMatches ? 30 : -80), exact: false, reason: "Comparable substitute; check brand and pack size." };
}

async function storedCandidates(searchItem: SearchableItem, query: string, enabled: readonly string[]): Promise<Candidate[]> {
  const cutoff = new Date(Date.now() - cacheWindowMs);
  const where = searchItem.productId
    ? {
        checkedAt: { gte: cutoff },
        OR: [
          { productId: searchItem.productId },
          { productName: { contains: query, mode: "insensitive" as const } },
        ],
      }
    : {
        checkedAt: { gte: cutoff },
        productName: { contains: query, mode: "insensitive" as const },
      };

  const prices = await prisma.supermarketPrice.findMany({
    where: { AND: [where, { retailer: { in: [...enabled] } }] },
    orderBy: { checkedAt: "desc" }, take: 100,
  });
  return prices.flatMap((price): Candidate[] => {
    const sourceRetailer = retailer(price.retailer);
    if (!sourceRetailer || price.price <= 0) return [];
    return [{
      retailer: sourceRetailer,
      productName: price.productName,
      price: price.price,
      packSize: price.packSize,
      barcode: null,
      isSpecial: price.isSpecial,
      sourceUrl: null,
      cached: true,
      source: "food",
      storeSpecific: false,
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
      const sourceRetailer = retailer(result.location_osm_display_name ?? result.location?.osm_display_name ?? result.location?.name);
      const price = numeric(result.price);
      if (!sourceRetailer || price === null || clean(result.currency).toUpperCase() !== "AUD") return [];
      const productName = clean(result.product_name) || query;
      return [{
        retailer: sourceRetailer,
        productName,
        price,
        packSize: packSize(productName),
        barcode,
        isSpecial: result.price_is_discounted === true,
        sourceUrl: null,
        cached: false,
        source: "open-prices",
        storeSpecific: false,
      }];
    });
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

async function retailerApiCandidates(
  queries: string[],
  options: { retailers: Array<"Coles" | "Woolworths" | "ALDI">; storeIds: Partial<Record<"Coles" | "Woolworths" | "ALDI", string>> },
): Promise<Candidate[]> {
  const batches = await Promise.all(queries.map((query) => searchColesAndWoolworths(query, options).catch(() => [])));
  const seen = new Set<string>();
  return batches.flat().flatMap((result): Candidate[] => {
    if (!Number.isFinite(result.price) || result.price <= 0) return [];
    const key = `${result.retailer}:${result.externalId ?? normalise(result.productName)}:${result.price}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{
      retailer: result.retailer,
      productName: result.productName,
      price: result.price,
      packSize: result.packSize,
      barcode: result.barcode,
      isSpecial: result.isSpecial,
      sourceUrl: result.sourceUrl,
      cached: false,
      source: result.retailer === "ALDI" ? "aldi-catalogue" : "retailer-api",
      storeSpecific: result.retailer !== "ALDI",
    }];
  });
}

async function cacheRetailerCandidates(productId: string | null, candidates: Candidate[]) {
  const live = candidates.filter((candidate) => candidate.source === "retailer-api");
  if (!live.length) return;
  await prisma.supermarketPrice.createMany({
    data: live.map((candidate) => ({
      productId,
      retailer: candidate.retailer,
      productName: candidate.productName,
      packSize: candidate.packSize,
      price: candidate.price,
      unitPrice: null,
      isSpecial: candidate.isSpecial,
      checkedAt: new Date(),
    })),
  }).catch((error) => console.error("Unable to cache retailer price candidates", error));
}

function quotaError(message: string) {
  const value = message.toLocaleLowerCase("en-AU");
  return value.includes("run out of searches") || value.includes("quota") || value.includes("searches left") || value.includes("monthly searches");
}

async function serpCandidates(query: string): Promise<Candidate[]> {
  if (process.env.FOOD_DISABLE_SERPAPI_PRICES === "1") return [];
  if ((priceGlobal.foodSerpDisabledUntil ?? 0) > Date.now()) return [];
  const apiKey = process.env.SERPAPI_API_KEY?.trim() || process.env.SERPAPI_KEY?.trim();
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
        barcode: null,
        isSpecial: normalise(extensions.join(" ")).includes("special"),
        sourceUrl: typeof rawUrl === "string" && rawUrl.trim() ? rawUrl.trim() : null,
        cached: false,
        source: "serpapi",
        storeSpecific: false,
      }];
    });
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

function buildMatches(
  entry: SearchableItem,
  query: string,
  candidates: Candidate[],
  allowSubstitutes: boolean,
  allowedRetailers: ReadonlySet<SupermarketRetailer> = new Set(supermarketRetailers),
) {
  const scored = candidates
    .filter((candidate) => allowedRetailers.has(candidate.retailer))
    .map((candidate) => {
      const assessment = matchScore(entry, query, candidate, allowSubstitutes);
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
        matchReason: assessment.reason,
        sourceUrl: candidate.sourceUrl,
        cached: candidate.cached,
        storeSpecific: candidate.storeSpecific,
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
  const labels: string[] = [];
  if (sources.has("food")) labels.push("Food Price Engine");
  if (sources.has("open-prices")) labels.push("Open Prices");
  if (sources.has("retailer-api")) labels.push("Coles and Woolworths");
  if (sources.has("aldi-catalogue")) labels.push("ALDI public catalogue");
  if (sources.has("serpapi")) labels.push("SerpApi");
  return (labels.join(" + ") || "Food Price Engine") as GroceryPriceProvider;
}

export async function POST(request: Request, context: { params: Promise<{ listId: string }> }) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ status: "error", error: "Sign in to search current grocery prices." }, { status: 401 });

  const { listId } = await context.params;
  let body: SearchRequestBody = {};
  try { body = await request.json() as SearchRequestBody; } catch { /* Defaults are valid. */ }

  const location = currentLocation(body.currentLocation);
  const requestedLocation = location ?? (typeof body.location === "string" ? body.location : null);
  const resolvedLocation = await resolveUserSearchLocation(session.user.id, requestedLocation);
  const allowSubstitutes = body.allowSubstitutes !== false;

  const [retailerPreferences, preferredStores] = await Promise.all([
    prisma.retailerPreference.findMany({ where: { userId: session.user.id } }),
    prisma.preferredRetailerStore.findMany({ where: { userId: session.user.id, isPreferred: true }, orderBy: { updatedAt: "desc" } }),
  ]);
  const enabledPrimaryRetailers = resolveEnabledRetailers(retailerPreferences);
  // ALDI exposes its public catalogue, but not a complete selected-store
  // availability feed. Include it in comparisons and label it accordingly.
  const activePrimaryRetailers = new Set<SupermarketRetailer>([...enabledPrimaryRetailers, "ALDI"]);
  const storeIds = preferredStoreIds(preferredStores);

  const list = await prisma.shoppingList.findUnique({
    where: { id: listId },
    include: {
      items: {
        where: { checked: false },
        orderBy: { id: "asc" },
        include: {
          product: { select: { id: true, barcode: true, name: true, canonicalName: true, brand: true, packSize: true } },
        },
      },
    },
  });
  if (!list) return NextResponse.json({ status: "error", error: "Shopping list not found." }, { status: 404 });

  const searchItems: SearchableItem[] = list.items.map((entry) => ({
    item: { id: entry.id, name: titleCase(entry.name), quantity: entry.quantity, unit: entry.unit },
    productId: entry.productId,
    barcode: entry.product?.barcode ?? null,
    productName: entry.product?.name ?? null,
    canonicalName: entry.product?.canonicalName ?? null,
    brand: entry.product?.brand ?? null,
    packSize: entry.product?.packSize ?? null,
  }));

  const sources = new Set<CandidateSource>();
  let cachedItemCount = 0;
  let liveItemCount = 0;

  const items = await mapWithConcurrency(searchItems, searchConcurrency, async (entry): Promise<LiveGroceryPriceItemResult> => {
    const query = titleCase(entry.item.name);
    let candidates = await storedCandidates(entry, query, enabledPrimaryRetailers);
    let matches = buildMatches(entry, query, candidates, allowSubstitutes, activePrimaryRetailers);
    const cachedPrimaryRetailers = new Set(matches.filter((match) => activePrimaryRetailers.has(match.retailer)).map((match) => match.retailer));

    if (cachedPrimaryRetailers.size < activePrimaryRetailers.size) {
      const queries = searchQueries(entry);
      const [openPrices, retailerPrices] = await Promise.all([
        entry.barcode ? openPricesCandidates(entry.barcode, query) : Promise.resolve([]),
        retailerApiCandidates(queries, { retailers: [...activePrimaryRetailers], storeIds }),
      ]);
      candidates = [...candidates, ...openPrices, ...retailerPrices];
      await cacheRetailerCandidates(entry.productId, retailerPrices);
      matches = buildMatches(entry, query, candidates, allowSubstitutes, activePrimaryRetailers);
    }

    if (!matches.length) {
      candidates = [...candidates, ...await serpCandidates(searchQueries(entry)[1] ?? query)];
      matches = buildMatches(entry, query, candidates, allowSubstitutes, activePrimaryRetailers);
    }

    for (const candidate of candidates) sources.add(candidate.source);
    if (candidates.some((candidate) => candidate.cached)) cachedItemCount += 1;
    if (candidates.some((candidate) => !candidate.cached)) liveItemCount += 1;

    return { item: entry.item, query, matches, best: matches[0] ?? null, error: null };
  });

  const retailerTotals = supermarketRetailers.filter((name) => activePrimaryRetailers.has(name)).map((name) => {
    const matches = items.map((item) => item.matches.find((match) => match.retailer === name)).filter((match): match is LiveGroceryPriceMatch => Boolean(match));
    return {
      retailer: name,
      total: money(matches.reduce((sum, match) => sum + match.estimatedTotal, 0)),
      matchedCount: matches.length,
      missingCount: items.length - matches.length,
    };
  });

  const unmatched = items.filter((item) => !item.best).length;
  const retailerApiConfigured = process.env.FOOD_DISABLE_WOOLWORTHS_API !== "1" || Boolean(process.env.COLES_API_KEY?.trim());
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
      ? `${unmatched} item${unmatched === 1 ? "" : "s"} had no available price.${retailerApiConfigured ? "" : " Retailer APIs are disabled or unconfigured."}`
      : null,
  };

  return NextResponse.json(response, { headers: { "Cache-Control": "no-store" } });
}
