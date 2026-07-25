import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  resolveUserSearchLocation,
  type CurrentSearchLocation,
  type ResolvedSearchLocation,
} from "@/lib/location-preferences";
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

const plantMilkTypes = ["almond", "oat", "soy", "coconut", "rice milk"] as const;
const unrelatedContexts = [
  "baby formula",
  "cat food",
  "cat treat",
  "dog food",
  "dog treat",
  "infant formula",
  "pet food",
  "pet treat",
] as const;
const specialisedMilkForms = [
  "chocolate milk",
  "condensed milk",
  "evaporated milk",
  "flavoured milk",
  "milk powder",
  "powdered milk",
  "strawberry milk",
] as const;

const stopWords = new Set([
  "and", "the", "with", "for", "from", "pack", "packet", "bottle", "bottles",
  "item", "items", "each", "ea", "pk", "can", "cans", "tin", "tins", "of",
]);

type SearchRequestBody = {
  allowSubstitutes?: unknown;
  currentLocation?: unknown;
  location?: unknown;
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

function currentLocationFromRequest(value: unknown): CurrentSearchLocation | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as Record<string, unknown>;
  const latitude = candidate.latitude;
  const longitude = candidate.longitude;
  const accuracy = candidate.accuracy;

  if (
    typeof latitude !== "number" ||
    !Number.isFinite(latitude) ||
    typeof longitude !== "number" ||
    !Number.isFinite(longitude)
  ) {
    return null;
  }

  return {
    latitude,
    longitude,
    accuracy:
      typeof accuracy === "number" && Number.isFinite(accuracy)
        ? accuracy
        : null,
  };
}

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
  if (value === "iga" || value.includes("iga australia") || value.includes("independent grocers of australia")) return "IGA";
  if (value.includes("drakes") || value.includes("drake supermarkets")) return "Drakes";
  if (value.includes("costco")) return "Costco";
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
    if (Number.isFinite(quantity) && quantity > 0) {
      return { amount: quantity, dimension: "count", label: count[0], unitLabel: "/item" };
    }
  }

  return null;
}

function queryMeasurement(item: SupermarketShoppingItem): Measurement | null {
  if (!item.quantity || !item.unit) return null;
  const unit = normalise(item.unit);
  if (["kg", "kilogram", "kilograms"].includes(unit)) return { amount: item.quantity, dimension: "weight", label: `${item.quantity} ${item.unit}`, unitLabel: "/kg" };
  if (["g", "gram", "grams"].includes(unit)) return { amount: item.quantity / 1000, dimension: "weight", label: `${item.quantity} ${item.unit}`, unitLabel: "/kg" };
  if (["l", "litre", "litres", "liter", "liters"].includes(unit)) return { amount: item.quantity, dimension: "volume", label: `${item.quantity} ${item.unit}`, unitLabel: "/L" };
  if (["ml", "millilitre", "millilitres", "milliliter", "milliliters"].includes(unit)) return { amount: item.quantity / 1000, dimension: "volume", label: `${item.quantity} ${item.unit}`, unitLabel: "/L" };
  if (["each", "ea", "item", "items", "pack", "packet", "tin", "can", "bottle"].includes(unit)) return { amount: item.quantity, dimension: "count", label: `${item.quantity} ${item.unit}`, unitLabel: "/item" };
  return null;
}

function safeExtensions(result: SerpShoppingResult) {
  return Array.isArray(result.extensions) ? result.extensions.map(cleanText).filter(Boolean) : [];
}

function resultText(result: SerpShoppingResult) {
  return [cleanText(result.title), ...safeExtensions(result)].filter(Boolean).join(" ");
}

function packMeasurement(result: SerpShoppingResult) {
  return parseMeasurement(resultText(result));
}

function hasAllRequirements(query: string, candidate: string) {
  const queryNormalised = normalise(query);
  const candidateNormalised = normalise(candidate);
  return protectedRequirements.every((aliases) => {
    const requested = aliases.some((alias) => queryNormalised.includes(alias));
    if (!requested) return true;
    return aliases.some((alias) => candidateNormalised.includes(alias));
  });
}

function preservesProductType(query: string, candidate: string) {
  const q = normalise(query);
  const c = normalise(candidate);
  const requestedTypes = protectedProductTypes.filter((type) => q.includes(type));
  if (!requestedTypes.length) return true;
  return requestedTypes.some((type) => c.includes(type));
}

function safeMilkSubstitute(query: string, candidate: string) {
  const q = normalise(query);
  const c = normalise(candidate);
  if (!q.includes("milk")) return true;
  if (unrelatedContexts.some((context) => c.includes(context))) return false;
  const requestedPlant = plantMilkTypes.find((type) => q.includes(type));
  if (requestedPlant) return c.includes(requestedPlant);
  if (specialisedMilkForms.some((form) => q.includes(form))) {
    return specialisedMilkForms.some((form) => q.includes(form) && c.includes(form));
  }
  return true;
}

function scoreCandidate(query: string, productName: string, allowSubstitutes: boolean) {
  const queryTokens = normalisedTokens(query);
  const productTokens = normalisedTokens(productName);
  const productSet = new Set(productTokens);
  const querySet = new Set(queryTokens);
  const shared = queryTokens.filter((token) => productSet.has(token)).length;
  const coverage = shared / Math.max(queryTokens.length, 1);
  const reverseCoverage = productTokens.filter((token) => querySet.has(token)).length / Math.max(productTokens.length, 1);
  const exact = normalise(query) === normalise(productName);
  const contains = normalise(productName).includes(normalise(query));

  if (!hasAllRequirements(query, productName)) return { score: -Infinity, kind: "substitute" as GroceryPriceMatchKind, reason: "Does not preserve a stated dietary or product requirement." };
  if (!preservesProductType(query, productName)) return { score: -Infinity, kind: "substitute" as GroceryPriceMatchKind, reason: "Changes the requested product type." };
  if (!safeMilkSubstitute(query, productName)) return { score: -Infinity, kind: "substitute" as GroceryPriceMatchKind, reason: "Milk substitute is not compatible with the requested type." };

  if (exact) return { score: 120, kind: "exact" as GroceryPriceMatchKind, reason: "Exact product name match." };
  if (contains && coverage >= 0.8) return { score: 105, kind: "exact" as GroceryPriceMatchKind, reason: "Strong product-name match." };
  if (coverage >= 0.8 && reverseCoverage >= 0.4) return { score: 95, kind: "exact" as GroceryPriceMatchKind, reason: "Most product terms match." };
  if (!allowSubstitutes) return { score: -Infinity, kind: "substitute" as GroceryPriceMatchKind, reason: "No exact product was found and substitutes are disabled." };
  if (coverage >= 0.6) return { score: 75 + coverage * 10, kind: "substitute" as GroceryPriceMatchKind, reason: "Comparable product with the requested characteristics." };
  if (shared >= 1 && queryTokens.length <= 2) return { score: 62, kind: "substitute" as GroceryPriceMatchKind, reason: "Close product-category substitute." };
  return { score: -Infinity, kind: "substitute" as GroceryPriceMatchKind, reason: "Product is not sufficiently similar." };
}

function buildSearchQuery(item: SupermarketShoppingItem, location: ResolvedSearchLocation) {
  const amount = item.quantity && item.unit ? ` ${item.quantity} ${item.unit}` : "";
  return `${item.name}${amount} supermarket ${location.label} Australia`;
}

function resultSource(result: SerpShoppingResult) {
  return result.source ?? result.seller ?? result.merchant;
}

function resultUrl(result: SerpShoppingResult) {
  return cleanText(result.product_link) || cleanText(result.link) || null;
}

function resultExtensions(result: SerpShoppingResult) {
  return Array.isArray(result.extensions) ? result.extensions.map(cleanText).filter(Boolean) : [];
}

async function fetchSerpApi(query: string, location: ResolvedSearchLocation) {
  const apiKey = process.env.SERPAPI_API_KEY?.trim();
  if (!apiKey) throw new Error("SERPAPI_API_KEY is not configured.");

  const params = new URLSearchParams({
    engine: "google_shopping",
    q: query,
    api_key: apiKey,
    gl: "au",
    hl: "en",
    location: location.label,
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const response = await fetch(`https://serpapi.com/search.json?${params.toString()}`, {
      cache: "no-store",
      signal: controller.signal,
    });
    const payload = await response.json() as SerpApiResponse;
    if (!response.ok || payload.error) {
      throw new Error(cleanText(payload.error) || `SerpApi returned HTTP ${response.status}.`);
    }
    const results = Array.isArray(payload.shopping_results)
      ? payload.shopping_results
      : Array.isArray(payload.inline_shopping_results)
        ? payload.inline_shopping_results
        : [];
    return results as SerpShoppingResult[];
  } finally {
    clearTimeout(timeout);
  }
}

function candidatesFromResults(results: SerpShoppingResult[]) {
  const candidates: CandidateSeed[] = [];
  results.forEach((result, rank) => {
    const retailer = sourceRetailer(resultSource(result));
    const productName = cleanText(result.title);
    const price = numericPrice(result);
    if (!retailer || !productName || price === null) return;
    const extensions = resultExtensions(result);
    const measurement = packMeasurement(result);
    candidates.push({
      retailer,
      productName,
      price,
      packSize: measurement?.label ?? null,
      measurement,
      isSpecial: extensions.some((value) => /special|sale|save|was\s*\$/i.test(value)),
      sourceUrl: resultUrl(result),
      rank,
      cached: false,
    });
  });
  return candidates;
}

function estimateForItem(item: SupermarketShoppingItem, candidate: CandidateSeed) {
  const requested = queryMeasurement(item);
  if (!requested || !candidate.measurement || requested.dimension !== candidate.measurement.dimension) {
    return { estimatedTotal: candidate.price, unitPrice: null, unitLabel: null as "/kg" | "/L" | "/item" | null };
  }

  const packs = Math.max(1, Math.ceil(requested.amount / candidate.measurement.amount));
  return {
    estimatedTotal: roundMoney(candidate.price * packs),
    unitPrice: roundMoney(candidate.price / candidate.measurement.amount),
    unitLabel: candidate.measurement.unitLabel,
  };
}

function selectMatches(item: SupermarketShoppingItem, candidates: CandidateSeed[], allowSubstitutes: boolean) {
  const query = item.name;
  const scored: ScoredCandidate[] = candidates.flatMap((candidate) => {
    const scoredMatch = scoreCandidate(query, candidate.productName, allowSubstitutes);
    if (!Number.isFinite(scoredMatch.score) || scoredMatch.score < 0) return [];
    const estimated = estimateForItem(item, candidate);
    return [{
      score: scoredMatch.score,
      rank: candidate.rank,
      match: {
        retailer: candidate.retailer,
        productName: candidate.productName,
        price: candidate.price,
        packSize: candidate.packSize,
        unitPrice: estimated.unitPrice,
        unitLabel: estimated.unitLabel,
        estimatedTotal: estimated.estimatedTotal,
        isSpecial: candidate.isSpecial,
        sourceUrl: candidate.sourceUrl,
        matchKind: scoredMatch.kind,
        matchReason: scoredMatch.reason,
        cached: candidate.cached,
      },
    }];
  });

  return supermarketRetailers.flatMap((retailer) => {
    const selected = scored
      .filter((candidate) => candidate.match.retailer === retailer)
      .sort((left, right) => right.score - left.score || left.match.estimatedTotal - right.match.estimatedTotal || left.rank - right.rank)[0];
    return selected ? [selected.match] : [];
  }).sort((left, right) => left.estimatedTotal - right.estimatedTotal);
}

async function candidatesForItem(item: SupermarketShoppingItem, location: ResolvedSearchLocation) {
  const query = buildSearchQuery(item, location);
  const cacheKey = `${normalise(query)}|${normalise(location.label)}`;
  const cached = priceSearchCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return { query, candidates: cached.candidates.map((candidate) => ({ ...candidate, cached: true })), cached: true };
  }

  const results = await fetchSerpApi(query, location);
  const candidates = candidatesFromResults(results);
  priceSearchCache.set(cacheKey, { expiresAt: Date.now() + cacheWindowMs, candidates });
  return { query, candidates, cached: false };
}

export async function POST(request: Request, context: { params: Promise<{ listId: string }> }) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ status: "error", error: "Sign in to search current prices." }, { status: 401 });

  const { listId } = await context.params;
  const body = await request.json().catch(() => ({})) as SearchRequestBody;
  const allowSubstitutes = body.allowSubstitutes !== false;
  const currentLocation = currentLocationFromRequest(body.currentLocation);
  const namedLocation = typeof body.location === "string" ? body.location : null;
  const resolvedLocation = await resolveUserSearchLocation(session.user.id, currentLocation ?? namedLocation);

  const list = await prisma.shoppingList.findUnique({
    where: { id: listId },
    include: {
      items: {
        where: { checked: false },
        select: { id: true, name: true, quantity: true, unit: true },
      },
    },
  });

  if (!list) return NextResponse.json({ status: "error", error: "Shopping list not found." }, { status: 404 });
  if (list.items.length === 0) return NextResponse.json({ status: "error", error: "This shopping list has no remaining items." }, { status: 400 });
  if (list.items.length > itemLimit) return NextResponse.json({ status: "error", error: `Search up to ${itemLimit} remaining items at once.` }, { status: 400 });

  const items: LiveGroceryPriceItemResult[] = [];
  let liveItemCount = 0;
  let cachedItemCount = 0;

  for (const item of list.items) {
    try {
      const searched = await candidatesForItem(item, resolvedLocation);
      if (searched.cached) cachedItemCount += 1;
      else liveItemCount += 1;
      const matches = selectMatches(item, searched.candidates, allowSubstitutes);
      items.push({
        item,
        query: searched.query,
        matches,
        best: matches[0] ?? null,
        error: null,
      });
    } catch (error) {
      items.push({
        item,
        query: buildSearchQuery(item, resolvedLocation),
        matches: [],
        best: null,
        error: error instanceof Error ? error.message : "Current price search failed for this item.",
      });
    }
  }

  const retailerTotals = supermarketRetailers.map((retailer) => {
    const retailerMatches = items.map((item) => item.matches.find((match) => match.retailer === retailer)).filter((match): match is LiveGroceryPriceMatch => Boolean(match));
    return {
      retailer,
      total: roundMoney(retailerMatches.reduce((sum, match) => sum + match.estimatedTotal, 0)),
      matchedCount: retailerMatches.length,
      missingCount: items.length - retailerMatches.length,
    };
  });

  const splitTotal = roundMoney(items.reduce((sum, item) => sum + (item.best?.estimatedTotal ?? 0), 0));
  const splitMatchedCount = items.filter((item) => item.best).length;
  const response: LiveGroceryPriceSearchResponse = {
    status: "success",
    listId,
    listName: list.name,
    location: resolvedLocation.label,
    locationSource: resolvedLocation.source,
    searchedAt: new Date().toISOString(),
    allowSubstitutes,
    items,
    retailerTotals,
    splitTotal,
    splitMatchedCount,
    liveItemCount,
    cachedItemCount,
    warning: items.some((item) => item.error) ? "Some items could not be refreshed. Available matches are still shown." : null,
  };

  return NextResponse.json(response);
}
