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
  if (value.includes("drakes") || value.includes("drake supermarkets") || value.includes("drakes supermarkets")) return "Drakes";
  if (value.includes("costco") || value.includes("costco wholesale")) return "Costco";
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
    return {
      amount: Number(count[1]),
      dimension: "count",
      label: count[0],
      unitLabel: "/item",
    };
  }

  return null;
}

function requestedMeasurement(item: SupermarketShoppingItem): Measurement | null {
  if (!item.quantity || item.quantity <= 0) return null;
  const unit = normalise(item.unit ?? "");
  if (["kg", "kilogram", "kilograms"].includes(unit)) return { amount: item.quantity, dimension: "weight", label: `${item.quantity} kg`, unitLabel: "/kg" };
  if (["g", "gram", "grams"].includes(unit)) return { amount: item.quantity / 1000, dimension: "weight", label: `${item.quantity} g`, unitLabel: "/kg" };
  if (["l", "litre", "litres", "liter", "liters"].includes(unit)) return { amount: item.quantity, dimension: "volume", label: `${item.quantity} L`, unitLabel: "/L" };
  if (["ml", "millilitre", "millilitres", "milliliter", "milliliters"].includes(unit)) return { amount: item.quantity / 1000, dimension: "volume", label: `${item.quantity} ml`, unitLabel: "/L" };
  return { amount: Math.ceil(item.quantity), dimension: "count", label: `${item.quantity} ${item.unit ?? "item"}`, unitLabel: "/item" };
}

function normalisedRequirementGroups(value: string) {
  const text = normalise(value);
  return protectedRequirements.filter((group) => group.some((term) => text.includes(term)));
}

function productType(value: string) {
  const text = normalise(value);
  return protectedProductTypes.find((type) => text.includes(type)) ?? null;
}

function hasAllRequirements(query: string, product: string) {
  const groups = normalisedRequirementGroups(query);
  const productText = normalise(product);
  return groups.every((group) => group.some((term) => productText.includes(term)));
}

function preservesProductType(query: string, product: string) {
  const requested = productType(query);
  if (!requested) return true;
  const candidate = productType(product);
  return candidate === null || candidate === requested;
}

function safeMilkSubstitute(query: string, product: string) {
  const queryText = normalise(query);
  const productText = normalise(product);
  if (!queryText.includes("milk")) return true;
  if (unrelatedContexts.some((term) => productText.includes(term))) return false;
  if (specialisedMilkForms.some((term) => productText.includes(term)) && !specialisedMilkForms.some((term) => queryText.includes(term))) return false;
  const requestedPlant = plantMilkTypes.find((type) => queryText.includes(type));
  if (!requestedPlant) return true;
  return productText.includes(requestedPlant);
}

function scoreProduct(query: string, productName: string, allowSubstitutes: boolean) {
  const queryTokens = normalisedTokens(query);
  const productTokens = normalisedTokens(productName);
  const querySet = new Set(queryTokens);
  const productSet = new Set(productTokens);
  const shared = queryTokens.filter((token) => productSet.has(token)).length;
  const coverage = queryTokens.length ? shared / queryTokens.length : 0;
  const reverseCoverage = productTokens.length ? shared / productTokens.length : 0;
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
  return `${item.name}${amount} supermarket ${location.searchText} Australia`;
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

function candidateFromResult(result: SerpShoppingResult, rank: number): CandidateSeed | null {
  const retailer = sourceRetailer(resultSource(result));
  const productName = cleanText(result.title);
  const price = numericPrice(result);
  if (!retailer || !productName || !price) return null;

  const extensions = resultExtensions(result);
  const combined = [productName, ...extensions].join(" · ");
  const measurement = parseMeasurement(combined);
  const packSize = measurement?.label ?? null;
  const isSpecial = cleanText(result.old_price).length > 0 || typeof result.extracted_old_price === "number" || extensions.some((extension) => /special|sale|save|was\s*\$/i.test(extension));

  return {
    retailer,
    productName,
    price,
    packSize,
    measurement,
    isSpecial,
    sourceUrl: resultUrl(result),
    rank,
    cached: false,
  };
}

function estimateTotal(item: SupermarketShoppingItem, candidate: CandidateSeed) {
  const requested = requestedMeasurement(item);
  if (!requested || !candidate.measurement || requested.dimension !== candidate.measurement.dimension) {
    const multiplier = !item.quantity || item.quantity <= 1 ? 1 : Math.ceil(item.quantity);
    return { total: roundMoney(candidate.price * multiplier), unitPrice: null, unitLabel: null, packCount: multiplier };
  }

  const packCount = Math.max(1, Math.ceil(requested.amount / candidate.measurement.amount));
  const unitPrice = roundMoney(candidate.price / candidate.measurement.amount);
  return {
    total: roundMoney(candidate.price * packCount),
    unitPrice,
    unitLabel: candidate.measurement.unitLabel,
    packCount,
  };
}

async function serperSearch(query: string, location: string) {
  const apiKey = process.env.SERPAPI_API_KEY;
  if (!apiKey) throw new Error("SERPAPI_API_KEY is not configured.");

  const params = new URLSearchParams({
    engine: "google_shopping",
    q: query,
    location,
    google_domain: "google.com.au",
    gl: "au",
    hl: "en",
    api_key: apiKey,
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const response = await fetch(`https://serpapi.com/search.json?${params.toString()}`, {
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Price search returned HTTP ${response.status}.`);
    const body = await response.json() as SerpApiResponse;
    if (body.error) throw new Error(cleanText(body.error) || "Price search provider returned an error.");
    const results = Array.isArray(body.shopping_results)
      ? body.shopping_results
      : Array.isArray(body.inline_shopping_results)
        ? body.inline_shopping_results
        : [];
    return results as SerpShoppingResult[];
  } finally {
    clearTimeout(timeout);
  }
}

async function candidatesForQuery(query: string, location: ResolvedSearchLocation) {
  const cacheKey = `${location.cacheKey}|${normalise(query)}`;
  const cached = priceSearchCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return { candidates: cached.candidates.map((candidate) => ({ ...candidate, cached: true })), cached: true };
  }

  const results = await serperSearch(query, location.searchText);
  const candidates = results.map(candidateFromResult).filter((candidate): candidate is CandidateSeed => candidate !== null);
  priceSearchCache.set(cacheKey, { expiresAt: Date.now() + cacheWindowMs, candidates });
  return { candidates, cached: false };
}

async function scoreItem(item: SupermarketShoppingItem, location: ResolvedSearchLocation, allowSubstitutes: boolean): Promise<LiveGroceryPriceItemResult> {
  const query = buildSearchQuery(item, location);
  try {
    const { candidates, cached } = await candidatesForQuery(query, location);
    const bestByRetailer = new Map<SupermarketRetailer, ScoredCandidate>();

    for (const candidate of candidates) {
      const scored = scoreProduct(item.name, candidate.productName, allowSubstitutes);
      if (!Number.isFinite(scored.score)) continue;
      const estimate = estimateTotal(item, candidate);
      const match: LiveGroceryPriceMatch = {
        retailer: candidate.retailer,
        productName: candidate.productName,
        price: candidate.price,
        packSize: candidate.packSize,
        estimatedTotal: estimate.total,
        unitPrice: estimate.unitPrice,
        unitLabel: estimate.unitLabel,
        packCount: estimate.packCount,
        isSpecial: candidate.isSpecial,
        sourceUrl: candidate.sourceUrl,
        cached: candidate.cached || cached,
        matchKind: scored.kind,
        matchReason: scored.reason,
      };
      const current = bestByRetailer.get(candidate.retailer);
      if (!current || scored.score > current.score || (scored.score === current.score && match.estimatedTotal < current.match.estimatedTotal)) {
        bestByRetailer.set(candidate.retailer, { match, score: scored.score, rank: candidate.rank });
      }
    }

    const matches = [...bestByRetailer.values()]
      .sort((left, right) => left.match.estimatedTotal - right.match.estimatedTotal || right.score - left.score || left.rank - right.rank)
      .map((entry) => entry.match);

    return {
      item,
      query,
      matches,
      best: matches[0] ?? null,
      error: null,
    };
  } catch (error) {
    return {
      item,
      query,
      matches: [],
      best: null,
      error: error instanceof Error ? error.message : "Current price search failed.",
    };
  }
}

export async function POST(request: Request, context: { params: Promise<{ listId: string }> }) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ status: "error", error: "Sign in to search current prices." }, { status: 401 });

  const { listId } = await context.params;
  const body = await request.json().catch(() => ({})) as SearchRequestBody;
  const allowSubstitutes = body.allowSubstitutes !== false;
  const currentLocation = currentLocationFromRequest(body.currentLocation);
  const location = await resolveUserSearchLocation(session.user.id, currentLocation, cleanText(body.location));

  const shoppingList = await prisma.shoppingList.findUnique({
    where: { id: listId },
    include: {
      items: {
        where: { checked: false },
        select: { id: true, name: true, quantity: true, unit: true },
        orderBy: { id: "asc" },
        take: itemLimit + 1,
      },
    },
  });
  if (!shoppingList) return NextResponse.json({ status: "error", error: "Shopping list not found." }, { status: 404 });
  if (shoppingList.items.length > itemLimit) return NextResponse.json({ status: "error", error: `Current price search supports up to ${itemLimit} unchecked items at a time.` }, { status: 400 });

  const searchedAt = new Date().toISOString();
  const items = await Promise.all(shoppingList.items.map((item) => scoreItem(item, location, allowSubstitutes)));
  const retailerTotals = supermarketRetailers.map((retailer) => {
    const matches = items.map((item) => item.matches.find((match) => match.retailer === retailer)).filter((match): match is LiveGroceryPriceMatch => Boolean(match));
    return {
      retailer,
      total: roundMoney(matches.reduce((sum, match) => sum + match.estimatedTotal, 0)),
      matchedCount: matches.length,
      missingCount: items.length - matches.length,
    };
  });
  const splitTotal = roundMoney(items.reduce((sum, item) => sum + (item.best?.estimatedTotal ?? 0), 0));
  const splitMatchedCount = items.filter((item) => item.best).length;
  const liveItemCount = items.filter((item) => item.matches.some((match) => !match.cached)).length;
  const cachedItemCount = items.filter((item) => item.matches.length > 0 && item.matches.every((match) => match.cached)).length;

  const response: LiveGroceryPriceSearchResponse = {
    status: "ok",
    searchedAt,
    location: location.label,
    locationSource: location.source,
    items,
    retailerTotals,
    splitTotal,
    splitMatchedCount,
    liveItemCount,
    cachedItemCount,
    warning: null,
  };

  return NextResponse.json(response);
}
