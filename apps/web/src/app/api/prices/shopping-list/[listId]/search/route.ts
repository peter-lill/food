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
  LiveGroceryPriceItemResult,
  LiveGroceryPriceMatch,
  LiveGroceryPriceSearchResponse,
} from "@/lib/prices/live-grocery-price.types";

export const runtime = "nodejs";
export const maxDuration = 120;

const cacheWindowMs = 6 * 60 * 60 * 1000;
const requestTimeoutMs = 5_500;
const searchConcurrency = 8;

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
  link?: unknown;
  product_link?: unknown;
  extensions?: unknown;
};

type SerpApiResponse = {
  shopping_results?: unknown;
  inline_shopping_results?: unknown;
  error?: unknown;
};

type Candidate = {
  retailer: SupermarketRetailer;
  productName: string;
  price: number;
  packSize: string | null;
  isSpecial: boolean;
  sourceUrl: string | null;
  rank: number;
  cached: boolean;
};

type CacheEntry = {
  expiresAt: number;
  candidates: Candidate[];
};

type PriceSearchGlobal = typeof globalThis & {
  foodGroceryPriceSearchCache?: Map<string, CacheEntry>;
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
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function currentLocationFromRequest(value: unknown): CurrentSearchLocation | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.latitude !== "number" ||
    !Number.isFinite(candidate.latitude) ||
    typeof candidate.longitude !== "number" ||
    !Number.isFinite(candidate.longitude)
  ) {
    return null;
  }

  return {
    latitude: candidate.latitude,
    longitude: candidate.longitude,
    accuracy:
      typeof candidate.accuracy === "number" && Number.isFinite(candidate.accuracy)
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

function resultSource(result: SerpShoppingResult) {
  return result.source ?? result.seller ?? result.merchant;
}

function resultUrl(result: SerpShoppingResult) {
  const value = result.product_link ?? result.link;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numericPrice(result: SerpShoppingResult) {
  if (typeof result.extracted_price === "number" && Number.isFinite(result.extracted_price)) {
    return result.extracted_price;
  }
  if (typeof result.price === "number" && Number.isFinite(result.price)) return result.price;
  const parsed = Number(cleanText(result.price).replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function resultExtensions(result: SerpShoppingResult) {
  return Array.isArray(result.extensions)
    ? result.extensions.map(cleanText).filter(Boolean)
    : [];
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

function cacheKey(query: string) {
  return normalise(query);
}

function cloneCandidates(candidates: Candidate[], cached: boolean) {
  return candidates.map((candidate) => ({ ...candidate, cached }));
}

async function searchSerpApi(query: string) {
  const apiKey = process.env.SERPAPI_API_KEY?.trim();
  if (!apiKey) throw new Error("Current online prices are not configured.");

  const key = cacheKey(query);
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

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), requestTimeoutMs);

  try {
    const response = await fetch(url, { cache: "no-store", signal: controller.signal });
    const payload = await response.json().catch(() => ({})) as SerpApiResponse;

    if (!response.ok) {
      if (cached?.candidates.length) {
        return { candidates: cloneCandidates(cached.candidates, true), cached: true };
      }
      const detail = cleanText(payload.error);
      throw new Error(detail || `Price provider returned HTTP ${response.status}.`);
    }

    const apiError = cleanText(payload.error);
    if (apiError) throw new Error(apiError);

    const rawResults = [
      ...(Array.isArray(payload.shopping_results) ? payload.shopping_results : []),
      ...(Array.isArray(payload.inline_shopping_results) ? payload.inline_shopping_results : []),
    ] as SerpShoppingResult[];

    const candidates = rawResults
      .map((result, rank): Candidate | null => {
        const retailer = sourceRetailer(resultSource(result));
        const productName = cleanText(result.title);
        const price = numericPrice(result);
        if (!retailer || !productName || price === null) return null;
        const extensionText = normalise(resultExtensions(result).join(" "));
        return {
          retailer,
          productName,
          price,
          packSize: packSize([productName, ...resultExtensions(result)].join(" ")),
          isSpecial: extensionText.includes("special") || extensionText.includes("sale") || extensionText.includes("save "),
          sourceUrl: resultUrl(result),
          rank,
          cached: false,
        };
      })
      .filter((candidate): candidate is Candidate => candidate !== null);

    priceSearchCache.set(key, {
      expiresAt: Date.now() + cacheWindowMs,
      candidates: cloneCandidates(candidates, false),
    });

    return { candidates, cached: false };
  } catch (error) {
    if (cached?.candidates.length) {
      return { candidates: cloneCandidates(cached.candidates, true), cached: true };
    }
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Price provider timed out for this item.");
    }
    throw error;
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
      },
    },
  });

  if (!list) {
    return NextResponse.json({ status: "error", error: "Shopping list not found." }, { status: 404 });
  }

  const listItems: SupermarketShoppingItem[] = list.items.map((item) => ({
    id: item.id,
    name: titleCase(item.name),
    quantity: item.quantity,
    unit: item.unit,
  }));

  let liveItemCount = 0;
  let cachedItemCount = 0;

  const items = await mapWithConcurrency(listItems, searchConcurrency, async (item): Promise<LiveGroceryPriceItemResult> => {
    const query = titleCase(item.name);
    try {
      const result = await searchSerpApi(query);
      if (result.cached) cachedItemCount += 1;
      else liveItemCount += 1;
      const matches = buildMatches(item, query, result.candidates, allowSubstitutes);
      return {
        item,
        query,
        matches,
        best: matches[0] ?? null,
        error: null,
      };
    } catch (error) {
      console.warn("Grocery price search failed", {
        item: item.name,
        query,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        item,
        query,
        matches: [],
        best: null,
        error: error instanceof Error ? error.message : "Current price search failed for this item.",
      };
    }
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
    splitTotal: roundMoney(items.reduce((sum, item) => sum + (item.best?.estimatedTotal ?? 0), 0)),
    splitMatchedCount: items.filter((item) => item.best).length,
    liveItemCount,
    cachedItemCount,
    warning: items.some((item) => item.error)
      ? `Searched all ${items.length} items. Some provider requests timed out; available and cached matches are still shown.`
      : null,
  };

  return NextResponse.json(response, {
    headers: { "Cache-Control": "no-store" },
  });
}
