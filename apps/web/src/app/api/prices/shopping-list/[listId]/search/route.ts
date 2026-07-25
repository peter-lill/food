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
    const amount = Number(count[1]);
    if (Number.isFinite(amount) && amount > 0) {
      return {
        amount,
        dimension: "count",
        label: count[0],
        unitLabel: "/item",
      };
    }
  }

  return null;
}

function itemMeasurement(item: SupermarketShoppingItem): Measurement | null {
  if (!item.quantity || !item.unit) return null;
  const unit = normalise(item.unit);
  if (["kg", "kilogram", "kilograms"].includes(unit)) {
    return { amount: item.quantity, dimension: "weight", label: `${item.quantity} kg`, unitLabel: "/kg" };
  }
  if (["g", "gram", "grams"].includes(unit)) {
    return { amount: item.quantity / 1000, dimension: "weight", label: `${item.quantity} g`, unitLabel: "/kg" };
  }
  if (["l", "litre", "litres", "liter", "liters"].includes(unit)) {
    return { amount: item.quantity, dimension: "volume", label: `${item.quantity} L`, unitLabel: "/L" };
  }
  if (["ml", "millilitre", "millilitres", "milliliter", "milliliters"].includes(unit)) {
    return { amount: item.quantity / 1000, dimension: "volume", label: `${item.quantity} ml`, unitLabel: "/L" };
  }
  if (["item", "items", "each", "ea", "pack", "packet", "tin", "can", "bottle"].includes(unit)) {
    return { amount: item.quantity, dimension: "count", label: `${item.quantity} ${item.unit}`, unitLabel: "/item" };
  }
  return null;
}

function estimateTotal(item: SupermarketShoppingItem, price: number, productMeasurement: Measurement | null) {
  const requested = itemMeasurement(item);
  if (!requested || !productMeasurement || requested.dimension !== productMeasurement.dimension) {
    return { total: price, unitPrice: null as number | null, unitLabel: null as string | null };
  }

  const packs = Math.max(1, Math.ceil(requested.amount / productMeasurement.amount));
  return {
    total: roundMoney(price * packs),
    unitPrice: roundMoney(price / productMeasurement.amount),
    unitLabel: productMeasurement.unitLabel,
  };
}

function hasAllRequirements(query: string, productName: string) {
  const queryValue = normalise(query);
  const productValue = normalise(productName);
  return protectedRequirements.every((aliases) => {
    const requested = aliases.some((alias) => queryValue.includes(alias));
    return !requested || aliases.some((alias) => productValue.includes(alias));
  });
}

function preservesProductType(query: string, productName: string) {
  const queryValue = normalise(query);
  const productValue = normalise(productName);
  const requestedType = protectedProductTypes.find((type) => queryValue.includes(type));
  return !requestedType || productValue.includes(requestedType);
}

function safeMilkSubstitute(query: string, productName: string) {
  const queryValue = normalise(query);
  if (!queryValue.includes("milk")) return true;
  const productValue = normalise(productName);
  if (unrelatedContexts.some((value) => productValue.includes(value))) return false;
  if (specialisedMilkForms.some((value) => productValue.includes(value)) && !specialisedMilkForms.some((value) => queryValue.includes(value))) return false;
  const requestedPlantType = plantMilkTypes.find((type) => queryValue.includes(type));
  return !requestedPlantType || productValue.includes(requestedPlantType);
}

function scoreProductMatch(query: string, productName: string, allowSubstitutes: boolean) {
  const queryTokens = normalisedTokens(query);
  const productTokens = normalisedTokens(productName);
  if (!queryTokens.length || !productTokens.length) return { score: -Infinity, kind: "substitute" as GroceryPriceMatchKind, reason: "No meaningful product terms matched." };
  const shared = queryTokens.filter((token) => productTokens.includes(token)).length;
  const coverage = shared / queryTokens.length;
  const reverseCoverage = shared / productTokens.length;
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

function cacheKey(query: string, location: ResolvedSearchLocation) {
  return [normalise(query), location.source, normalise(location.label), location.latitude ?? "", location.longitude ?? "", location.radius ?? ""].join("|");
}

function cloneCandidates(candidates: CandidateSeed[], cached: boolean) {
  return candidates.map((candidate) => ({ ...candidate, cached }));
}

async function searchSerpApi(query: string, location: ResolvedSearchLocation) {
  const apiKey = process.env.SERPAPI_API_KEY?.trim();
  if (!apiKey) throw new Error("Current online prices are not configured. Set SERPAPI_API_KEY on the Food server.");

  const key = cacheKey(query, location);
  const cached = priceSearchCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return { candidates: cloneCandidates(cached.candidates, true), cached: true };
  }

  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google_shopping");
  url.searchParams.set("q", query);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("gl", "au");
  url.searchParams.set("hl", "en");
  url.searchParams.set("location", location.label);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const response = await fetch(url, { cache: "no-store", signal: controller.signal });
    if (!response.ok) throw new Error(`Price search returned HTTP ${response.status}.`);
    const payload = await response.json() as SerpApiResponse;
    const apiError = cleanText(payload.error);
    if (apiError) throw new Error(apiError);
    const rawResults = [
      ...(Array.isArray(payload.shopping_results) ? payload.shopping_results : []),
      ...(Array.isArray(payload.inline_shopping_results) ? payload.inline_shopping_results : []),
    ] as SerpShoppingResult[];

    const candidates = rawResults
      .map((result, rank): CandidateSeed | null => {
        const retailer = sourceRetailer(resultSource(result));
        const productName = cleanText(result.title);
        const price = numericPrice(result);
        if (!retailer || !productName || price === null) return null;
        const extensions = resultExtensions(result);
        const measurement = parseMeasurement([productName, ...extensions].join(" "));
        const extensionText = normalise(extensions.join(" "));
        return {
          retailer,
          productName,
          price,
          packSize: measurement?.label ?? null,
          measurement,
          isSpecial: extensionText.includes("special") || extensionText.includes("sale") || extensionText.includes("save "),
          sourceUrl: resultUrl(result),
          rank,
          cached: false,
        };
      })
      .filter((candidate): candidate is CandidateSeed => candidate !== null);

    priceSearchCache.set(key, {
      expiresAt: Date.now() + cacheWindowMs,
      candidates: cloneCandidates(candidates, false),
    });

    return { candidates, cached: false };
  } finally {
    clearTimeout(timer);
  }
}

function scoreCandidates(item: SupermarketShoppingItem, query: string, candidates: CandidateSeed[], allowSubstitutes: boolean) {
  return candidates
    .map((candidate): ScoredCandidate | null => {
      const assessment = scoreProductMatch(item.name, candidate.productName, allowSubstitutes);
      if (!Number.isFinite(assessment.score)) return null;
      const estimate = estimateTotal(item, candidate.price, candidate.measurement);
      return {
        score: assessment.score,
        rank: candidate.rank,
        match: {
          retailer: candidate.retailer,
          productName: candidate.productName,
          price: candidate.price,
          estimatedTotal: estimate.total,
          packSize: candidate.packSize,
          unitPrice: estimate.unitPrice,
          unitLabel: estimate.unitLabel,
          isSpecial: candidate.isSpecial,
          matchKind: assessment.kind,
          matchReason: assessment.reason,
          sourceUrl: candidate.sourceUrl,
          cached: candidate.cached,
        },
      };
    })
    .filter((candidate): candidate is ScoredCandidate => candidate !== null)
    .sort((left, right) => right.score - left.score || left.match.estimatedTotal - right.match.estimatedTotal || left.rank - right.rank);
}

function bestRetailerMatches(candidates: ScoredCandidate[]) {
  return supermarketRetailers
    .map((retailer) => candidates.find((candidate) => candidate.match.retailer === retailer)?.match ?? null)
    .filter((match): match is LiveGroceryPriceMatch => match !== null)
    .sort((left, right) => left.estimatedTotal - right.estimatedTotal);
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
    // Empty request body is valid and uses defaults.
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
      },
    },
  });

  if (!list) {
    return NextResponse.json({ status: "error", error: "Shopping list not found." }, { status: 404 });
  }

  const listItems = list.items.slice(0, itemLimit).map((item): SupermarketShoppingItem => ({
    id: item.id,
    name: item.name,
    quantity: item.quantity,
    unit: item.unit,
  }));

  const items: LiveGroceryPriceItemResult[] = [];
  let liveItemCount = 0;
  let cachedItemCount = 0;

  for (const item of listItems) {
    const query = buildSearchQuery(item, resolvedLocation);
    try {
      const result = await searchSerpApi(query, resolvedLocation);
      if (result.cached) cachedItemCount += 1;
      else liveItemCount += 1;
      const scored = scoreCandidates(item, query, result.candidates, allowSubstitutes);
      const matches = bestRetailerMatches(scored);
      items.push({
        item,
        query,
        matches,
        best: matches[0] ?? null,
        error: null,
      });
    } catch (error) {
      items.push({
        item,
        query,
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
    provider: "SerpApi Google Shopping",
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
