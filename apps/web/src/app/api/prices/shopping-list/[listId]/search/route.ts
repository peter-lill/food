import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  supermarketRetailers,
  type SupermarketRetailer,
  type SupermarketShoppingItem,
} from "@/lib/prices/supermarket-comparison.types";
import type {
  GroceryPriceMatchKind,
  LiveGroceryPriceItemResult,
  LiveGroceryPriceMatch,
  LiveGroceryPriceSearchResponse,
} from "@/lib/prices/live-grocery-price.types";

export const runtime = "nodejs";
export const maxDuration = 120;

const itemLimit = 25;
const cacheWindowMs = 6 * 60 * 60 * 1000;
const requestTimeoutMs = 15_000;

const protectedRequirements = [
  ["lactose free"],
  ["gluten free"],
  ["dairy free"],
  ["nut free"],
  ["sugar free", "no sugar"],
  ["no added sugar"],
  ["unsweetened"],
  ["decaf", "decaffeinated"],
  ["organic"],
  ["free range"],
  ["full cream"],
  ["light milk", "lite milk", "reduced fat", "low fat"],
  ["skim", "skimmed"],
  ["vegan"],
  ["vegetarian"],
  ["halal"],
  ["wholemeal", "whole wheat"],
  ["brown rice", "brown bread"],
  ["white rice", "white bread"],
] as const;

const protectedProductTypes = [
  "beef",
  "chicken",
  "lamb",
  "pork",
  "turkey",
  "salmon",
  "tuna",
  "prawn",
  "tofu",
  "almond",
  "oat",
  "soy",
  "coconut",
] as const;

const stopWords = new Set([
  "and", "the", "with", "for", "from", "pack", "packet", "bottle", "bottles",
  "item", "items", "each", "ea", "pk", "can", "cans", "tin", "tins", "of",
]);

type SearchRequestBody = {
  allowSubstitutes?: unknown;
};

type SerpShoppingResult = {
  title?: unknown;
  source?: unknown;
  seller?: unknown;
  merchant?: unknown;
  price?: unknown;
  extracted_price?: unknown;
  old_price?: unknown;
  extracted_old_price?: unknown;
  link?: unknown;
  product_link?: unknown;
  extensions?: unknown;
};

type SerpApiResponse = {
  shopping_results?: unknown;
  inline_shopping_results?: unknown;
  error?: unknown;
};

type Measurement = {
  amount: number;
  dimension: "weight" | "volume" | "count";
  label: string;
  unitLabel: "/kg" | "/L" | "/item";
};

type CandidateSeed = {
  retailer: SupermarketRetailer;
  productName: string;
  price: number;
  packSize: string | null;
  measurement: Measurement | null;
  isSpecial: boolean;
  sourceUrl: string | null;
  rank: number;
  cached: boolean;
};

type ScoredCandidate = {
  match: LiveGroceryPriceMatch;
  score: number;
  rank: number;
};

type PriceSearchCacheEntry = {
  expiresAt: number;
  candidates: CandidateSeed[];
};

type PriceSearchGlobal = typeof globalThis & {
  foodGroceryPriceSearchCache?: Map<string, PriceSearchCacheEntry>;
};

const priceSearchGlobal = globalThis as PriceSearchGlobal;
const priceSearchCache = priceSearchGlobal.foodGroceryPriceSearchCache
  ?? new Map<string, PriceSearchCacheEntry>();
priceSearchGlobal.foodGroceryPriceSearchCache = priceSearchCache;

function cleanText(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function normalise(value: string) {
  return value
    .toLocaleLowerCase("en-AU")
    .replace(/[-_/]+/g, " ")
    .replace(/[^a-z0-9.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalisedTokens(value: string) {
  return normalise(value)
    .split(" ")
    .filter((token) => token.length > 1)
    .filter((token) => !stopWords.has(token))
    .filter((token) => !/^\d+(?:\.\d+)?$/.test(token))
    .filter((token) => !["g", "kg", "ml", "l"].includes(token));
}

function sourceRetailer(source: unknown): SupermarketRetailer | null {
  const value = normalise(cleanText(source));
  if (!value) return null;
  if (value.includes("woolworths")) return "Woolworths";
  if (value.includes("coles")) return "Coles";
  if (value === "aldi" || value.includes("aldi australia")) return "ALDI";
  return null;
}

function numericPrice(result: SerpShoppingResult) {
  if (typeof result.extracted_price === "number" && Number.isFinite(result.extracted_price)) {
    return result.extracted_price;
  }
  if (typeof result.price === "number" && Number.isFinite(result.price)) {
    return result.price;
  }

  const raw = cleanText(result.price).replace(/[^0-9.]/g, "");
  const price = Number(raw);
  return Number.isFinite(price) && price > 0 ? price : null;
}

function parseMeasurement(value: string): Measurement | null {
  const text = value.replace(/,/g, "");
  const multi = text.match(/(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(kg|g|ml|l)\b/i);

  if (multi) {
    const count = Number(multi[1]);
    const quantity = Number(multi[2]);
    const unit = multi[3].toLocaleLowerCase("en-AU");
    if (!Number.isFinite(count) || !Number.isFinite(quantity) || count <= 0 || quantity <= 0) return null;

    if (unit === "kg" || unit === "g") {
      return {
        amount: count * (unit === "kg" ? quantity : quantity / 1000),
        dimension: "weight",
        label: multi[0],
        unitLabel: "/kg",
      };
    }

    return {
      amount: count * (unit === "l" ? quantity : quantity / 1000),
      dimension: "volume",
      label: multi[0],
      unitLabel: "/L",
    };
  }

  const single = text.match(/(\d+(?:\.\d+)?)\s*(kg|g|ml|l)\b/i);
  if (single) {
    const quantity = Number(single[1]);
    const unit = single[2].toLocaleLowerCase("en-AU");
    if (!Number.isFinite(quantity) || quantity <= 0) return null;

    if (unit === "kg" || unit === "g") {
      return {
        amount: unit === "kg" ? quantity : quantity / 1000,
        dimension: "weight",
        label: single[0],
        unitLabel: "/kg",
      };
    }

    return {
      amount: unit === "l" ? quantity : quantity / 1000,
      dimension: "volume",
      label: single[0],
      unitLabel: "/L",
    };
  }

  const count = text.match(/(\d+)\s*(?:pack|pk|pieces?|rolls?|capsules?|tablets?|tabs?|sachets?|cans?|bottles?)\b/i);
  if (count) {
    const quantity = Number(count[1]);
    if (!Number.isFinite(quantity) || quantity <= 0) return null;
    return {
      amount: quantity,
      dimension: "count",
      label: count[0],
      unitLabel: "/item",
    };
  }

  return null;
}

function targetMeasurement(item: SupermarketShoppingItem): Measurement | null {
  const quantity = item.quantity && item.quantity > 0 ? item.quantity : 1;
  const unit = normalise(item.unit ?? "item");

  if (unit === "kg" || unit === "g") {
    return {
      amount: unit === "kg" ? quantity : quantity / 1000,
      dimension: "weight",
      label: `${quantity} ${item.unit ?? unit}`,
      unitLabel: "/kg",
    };
  }

  if (unit === "l" || unit === "ml") {
    return {
      amount: unit === "l" ? quantity : quantity / 1000,
      dimension: "volume",
      label: `${quantity} ${item.unit ?? unit}`,
      unitLabel: "/L",
    };
  }

  const nameMeasurement = parseMeasurement(item.name);
  if (nameMeasurement) {
    return {
      ...nameMeasurement,
      amount: nameMeasurement.amount * Math.max(1, Math.ceil(quantity)),
    };
  }

  // "item" means a number of retail packs, not a measurement dimension.
  // Leaving the target untyped allows entries such as "milk" to match a 2 L bottle.
  return null;
}

function requestedPackCount(item: SupermarketShoppingItem) {
  return item.quantity && item.quantity > 1 ? Math.ceil(item.quantity) : 1;
}

function searchQuery(item: SupermarketShoppingItem) {
  const measurement = parseMeasurement(item.name);
  const unit = normalise(item.unit ?? "");
  if (measurement || !item.quantity || !["kg", "g", "l", "ml"].includes(unit)) return item.name;
  return `${item.name} ${item.quantity}${item.unit}`;
}

function itemRequirements(itemName: string) {
  const value = normalise(itemName);
  return protectedRequirements.filter((aliases) => aliases.some((alias) => value.includes(alias)));
}

function requirementsPreserved(itemName: string, candidateName: string) {
  const candidate = normalise(candidateName);
  return itemRequirements(itemName).every((aliases) => aliases.some((alias) => candidate.includes(alias)));
}

function productTypePreserved(itemName: string, candidateName: string) {
  const item = normalise(itemName);
  const candidate = normalise(candidateName);
  const requiredTypes = protectedProductTypes.filter((type) => item.includes(type));
  return requiredTypes.every((type) => candidate.includes(type));
}

function incompatibleForm(itemName: string, candidateName: string) {
  const item = normalise(itemName);
  const candidate = normalise(candidateName);
  const opposites = [
    ["fresh", "frozen"],
    ["unsweetened", "sweetened"],
    ["full cream", "skim"],
    ["full cream", "reduced fat"],
    ["full cream", "low fat"],
  ] as const;

  return opposites.some(([left, right]) => (
    (item.includes(left) && candidate.includes(right))
    || (item.includes(right) && candidate.includes(left))
  ));
}

function nameScore(itemName: string, candidateName: string) {
  const item = normalise(itemName);
  const candidate = normalise(candidateName);
  if (item === candidate) return 1;
  if (candidate.includes(item)) return 0.96;

  const itemTokens = new Set(normalisedTokens(itemName));
  const candidateTokens = new Set(normalisedTokens(candidateName));
  if (itemTokens.size === 0) return 0;
  const overlap = [...itemTokens].filter((token) => candidateTokens.has(token)).length;
  return overlap / itemTokens.size;
}

function estimateTotal(item: SupermarketShoppingItem, candidate: CandidateSeed) {
  const target = targetMeasurement(item);
  if (!target || !candidate.measurement || target.dimension !== candidate.measurement.dimension) {
    return roundMoney(candidate.price * requestedPackCount(item));
  }

  const packs = Math.max(1, Math.ceil((target.amount - 0.000001) / candidate.measurement.amount));
  return roundMoney(candidate.price * packs);
}

function classifyCandidate(
  item: SupermarketShoppingItem,
  candidate: CandidateSeed,
  allowSubstitutes: boolean,
): ScoredCandidate | null {
  if (!requirementsPreserved(item.name, candidate.productName)) return null;
  if (!productTypePreserved(item.name, candidate.productName)) return null;
  if (incompatibleForm(item.name, candidate.productName)) return null;

  const score = nameScore(item.name, candidate.productName);
  const target = targetMeasurement(item);
  const sameDimension = !target || !candidate.measurement || target.dimension === candidate.measurement.dimension;
  if (!sameDimension) return null;

  const sizeRatio = target && candidate.measurement
    ? Math.min(target.amount, candidate.measurement.amount) / Math.max(target.amount, candidate.measurement.amount)
    : 1;
  const isExact = score >= 0.8 && sizeRatio >= 0.85;

  let matchKind: GroceryPriceMatchKind;
  if (isExact) {
    matchKind = "exact";
  } else if (allowSubstitutes && score >= 0.28) {
    matchKind = "substitute";
  } else {
    return null;
  }

  const unitPrice = candidate.measurement
    ? roundMoney(candidate.price / candidate.measurement.amount)
    : null;
  const sizeNote = target && candidate.measurement && sizeRatio < 0.85
    ? ` Different pack size: ${candidate.measurement.label}.`
    : "";
  const matchReason = matchKind === "exact"
    ? `Exact product description and pack-size match.${sizeNote}`
    : `Comparable substitute preserving product type and stated dietary requirements.${sizeNote}`;

  return {
    score,
    rank: candidate.rank,
    match: {
      retailer: candidate.retailer,
      productName: candidate.productName,
      price: candidate.price,
      estimatedTotal: estimateTotal(item, candidate),
      packSize: candidate.packSize,
      unitPrice,
      unitLabel: candidate.measurement?.unitLabel ?? null,
      isSpecial: candidate.isSpecial,
      matchKind,
      matchReason,
      sourceUrl: candidate.sourceUrl,
      cached: candidate.cached,
    },
  };
}

function selectMatches(
  item: SupermarketShoppingItem,
  candidates: CandidateSeed[],
  allowSubstitutes: boolean,
) {
  return supermarketRetailers
    .map((retailer) => {
      const scored = candidates
        .filter((candidate) => candidate.retailer === retailer)
        .map((candidate) => classifyCandidate(item, candidate, allowSubstitutes))
        .filter((candidate): candidate is ScoredCandidate => candidate !== null)
        .sort((left, right) => {
          if (left.match.matchKind !== right.match.matchKind) {
            return left.match.matchKind === "exact" ? -1 : 1;
          }
          return right.score - left.score
            || left.rank - right.rank
            || left.match.estimatedTotal - right.match.estimatedTotal;
        });
      return scored[0]?.match ?? null;
    })
    .filter((match): match is LiveGroceryPriceMatch => match !== null)
    .sort((left, right) => left.estimatedTotal - right.estimatedTotal);
}

function candidateFromSerpResult(result: SerpShoppingResult, rank: number): CandidateSeed | null {
  const retailer = sourceRetailer(result.source)
    ?? sourceRetailer(result.seller)
    ?? sourceRetailer(result.merchant);
  const productName = cleanText(result.title);
  const price = numericPrice(result);
  if (!retailer || !productName || price === null) return null;

  const measurement = parseMeasurement(productName);
  const oldPrice = typeof result.extracted_old_price === "number"
    ? result.extracted_old_price
    : Number(cleanText(result.old_price).replace(/[^0-9.]/g, ""));
  const extensions = Array.isArray(result.extensions)
    ? result.extensions.map((extension) => cleanText(extension)).join(" ")
    : cleanText(result.extensions);
  const sourceUrl = cleanText(result.link) || cleanText(result.product_link) || null;

  return {
    retailer,
    productName,
    price,
    packSize: measurement?.label ?? null,
    measurement,
    isSpecial: (Number.isFinite(oldPrice) && oldPrice > price)
      || /special|sale|half price|save/i.test(extensions),
    sourceUrl,
    rank,
    cached: false,
  };
}

function removeExpiredCacheEntries() {
  if (priceSearchCache.size < 200) return;
  const now = Date.now();
  for (const [key, entry] of priceSearchCache) {
    if (entry.expiresAt <= now) priceSearchCache.delete(key);
  }
}

async function searchGoogleShopping(query: string, apiKey: string, location: string) {
  const key = `${normalise(location)}|${normalise(query)}`;
  const cached = priceSearchCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return {
      cached: true,
      candidates: cached.candidates.map((candidate) => ({ ...candidate, cached: true })),
    };
  }

  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google_shopping_light");
  url.searchParams.set("q", query);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("location", location);
  url.searchParams.set("gl", "au");
  url.searchParams.set("hl", "en");
  url.searchParams.set("google_domain", "google.com.au");
  url.searchParams.set("num", "40");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    const payload = await response.json() as SerpApiResponse;

    if (!response.ok) {
      throw new Error(cleanText(payload.error) || `Price search returned HTTP ${response.status}.`);
    }

    const results = Array.isArray(payload.shopping_results)
      ? payload.shopping_results
      : Array.isArray(payload.inline_shopping_results)
        ? payload.inline_shopping_results
        : [];
    const candidates = results
      .map((result, index) => candidateFromSerpResult(result as SerpShoppingResult, index))
      .filter((candidate): candidate is CandidateSeed => candidate !== null);

    removeExpiredCacheEntries();
    priceSearchCache.set(key, {
      expiresAt: Date.now() + cacheWindowMs,
      candidates: candidates.map((candidate) => ({ ...candidate, cached: false })),
    });

    return { cached: false, candidates };
  } finally {
    clearTimeout(timeout);
  }
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T, index: number) => Promise<R>,
) {
  const results = new Array<R>(values.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= values.length) return;
      results[index] = await mapper(values[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, () => worker()));
  return results;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ listId: string }> },
) {
  const { listId } = await params;
  const apiKey = process.env.SERPAPI_KEY?.trim();
  const location = process.env.GROCERY_PRICE_SEARCH_LOCATION?.trim()
    || "Brisbane, Queensland, Australia";

  if (!apiKey) {
    return NextResponse.json(
      {
        status: "error",
        error: "Live grocery price search is not configured. Add SERPAPI_KEY to Food's .env file and restart the server.",
      },
      { status: 503 },
    );
  }

  let body: SearchRequestBody = {};
  try {
    body = await request.json() as SearchRequestBody;
  } catch {
    body = {};
  }
  const allowSubstitutes = body.allowSubstitutes !== false;

  const list = await prisma.shoppingList.findUnique({
    where: { id: listId },
    select: {
      id: true,
      items: {
        where: { checked: false },
        orderBy: { name: "asc" },
        select: { id: true, name: true, quantity: true, unit: true },
      },
    },
  });

  if (!list) {
    return NextResponse.json(
      { status: "error", error: "This Shopping list no longer exists." },
      { status: 404 },
    );
  }

  const items = list.items.slice(0, itemLimit);
  let cachedItemCount = 0;
  let liveItemCount = 0;
  const selectedLiveMatches: LiveGroceryPriceMatch[] = [];

  const itemResults = await mapWithConcurrency(items, 3, async (item): Promise<LiveGroceryPriceItemResult> => {
    const query = searchQuery(item);

    try {
      const search = await searchGoogleShopping(query, apiKey, location);
      if (search.cached) cachedItemCount += 1;
      else liveItemCount += 1;

      const matches = selectMatches(item, search.candidates, allowSubstitutes);
      if (!search.cached) selectedLiveMatches.push(...matches);

      return {
        item,
        query,
        matches,
        best: matches[0] ?? null,
        error: null,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Current prices could not be searched.";
      return {
        item,
        query,
        matches: [],
        best: null,
        error: message,
      };
    }
  });

  const uniqueMatches = new Map<string, LiveGroceryPriceMatch>();
  for (const match of selectedLiveMatches) {
    uniqueMatches.set([
      match.retailer,
      normalise(match.productName),
      normalise(match.packSize ?? ""),
      match.price,
    ].join("|"), match);
  }

  if (uniqueMatches.size > 0) {
    try {
      await prisma.supermarketPrice.createMany({
        data: [...uniqueMatches.values()].map((match) => ({
          retailer: match.retailer,
          productName: match.productName,
          brand: null,
          packSize: match.packSize,
          price: match.price,
          unitPrice: match.unitPrice,
          isSpecial: match.isSpecial,
          checkedAt: new Date(),
        })),
      });
    } catch (error) {
      console.error("Unable to save live grocery prices", error);
    }
  }

  const retailerTotals = supermarketRetailers.map((retailer) => {
    const matches = itemResults
      .map((result) => result.matches.find((match) => match.retailer === retailer))
      .filter((match): match is LiveGroceryPriceMatch => Boolean(match));
    return {
      retailer,
      total: roundMoney(matches.reduce((sum, match) => sum + match.estimatedTotal, 0)),
      matchedCount: matches.length,
      missingCount: itemResults.length - matches.length,
    };
  });
  const splitTotal = roundMoney(itemResults.reduce((sum, item) => sum + (item.best?.estimatedTotal ?? 0), 0));
  const splitMatchedCount = itemResults.filter((item) => item.best).length;
  const failedItems = itemResults.filter((item) => item.error).length;
  const warningParts: string[] = [];

  if (list.items.length > itemLimit) {
    warningParts.push(`Only the first ${itemLimit} remaining items were searched.`);
  }
  if (failedItems > 0) {
    warningParts.push(`${failedItems} item${failedItems === 1 ? "" : "s"} could not be refreshed.`);
  }

  const response: LiveGroceryPriceSearchResponse = {
    status: "success",
    provider: "SerpApi Google Shopping",
    location,
    allowSubstitutes,
    searchedAt: new Date().toISOString(),
    items: itemResults,
    retailerTotals,
    splitTotal,
    splitMatchedCount,
    cachedItemCount,
    liveItemCount,
    warning: warningParts.length > 0 ? warningParts.join(" ") : null,
  };

  return NextResponse.json(response);
}
