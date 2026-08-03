import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  resolveUserSearchLocation,
  type CurrentSearchLocation,
  type ResolvedSearchLocation,
} from "@/lib/location-preferences";
import { prisma } from "@/lib/prisma";
import {
  enrichProductFromCandidate,
  type ProductEnrichmentCandidate,
} from "@/lib/products/product-intelligence";

export const runtime = "nodejs";

const supportedExternalBarcode = /^\d{7,14}$/;
const providerTimeoutMs = 6_000;

type RouteContext = { params: Promise<{ barcode: string }> };
type ProductLookupSource = "local" | "open-food-facts" | "upcitemdb" | "serpapi";

type OpenFoodFactsProduct = {
  product_name?: string;
  product_name_en?: string;
  generic_name?: string;
  brands?: string;
  quantity?: string;
  image_front_url?: string;
  image_url?: string;
  categories?: string;
  ingredients_text?: string;
  origins?: string;
  manufacturing_places?: string;
  nutriments?: Record<string, unknown>;
};

type OpenFoodFactsResponse = { status?: number; product?: OpenFoodFactsProduct };
type UpcItemDbItem = {
  title?: string;
  brand?: string;
  category?: string;
  description?: string;
  size?: string;
  images?: string[];
};
type UpcItemDbResponse = { items?: UpcItemDbItem[] };
type SerpApiProductResult = {
  title?: unknown;
  source?: unknown;
  snippet?: unknown;
  link?: unknown;
  product_link?: unknown;
  thumbnail?: unknown;
};
type SerpApiResponse = {
  shopping_results?: unknown;
  inline_shopping_results?: unknown;
  organic_results?: unknown;
  error?: unknown;
};

function cleanText(value: unknown, maximumLength = 240) {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.slice(0, maximumLength) : null;
}

function numeric(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function kilojoulesToCalories(value: number | null) {
  return value === null ? null : value / 4.184;
}

function productResponse(
  product: {
    id: string;
    name: string;
    canonicalName?: string | null;
    brand: string | null;
    barcode: string | null;
    imageUrl?: string | null;
    packSize?: string | null;
  },
  source: ProductLookupSource,
  changedFields: string[] = [],
) {
  return NextResponse.json({ found: true, source, changedFields, product });
}

async function withProviderTimeout<T>(lookup: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), providerTimeoutMs);
  try {
    return await lookup(controller.signal);
  } finally {
    clearTimeout(timeout);
  }
}

function candidateScore(candidate: ProductEnrichmentCandidate) {
  let score = candidate.confidence;
  if (candidate.brand) score += 8;
  if (candidate.imageUrl) score += 10;
  if (candidate.packSize) score += 8;
  if (candidate.category) score += 4;
  if (candidate.description) score += 5;
  if (candidate.calories !== null && candidate.calories !== undefined) score += 8;
  if (/\d+\s*(?:mg|g|kg|ml|l|capsules?|tablets?|pack|pk)/i.test(candidate.name)) score += 10;
  return score;
}

async function lookupOpenFoodFacts(barcode: string, signal: AbortSignal): Promise<ProductEnrichmentCandidate | null> {
  const fields = [
    "status", "product_name", "product_name_en", "generic_name", "brands", "quantity",
    "image_front_url", "image_url", "categories", "ingredients_text", "origins",
    "manufacturing_places", "nutriments",
  ].join(",");
  const response = await fetch(
    `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=${fields}`,
    {
      cache: "no-store",
      headers: { Accept: "application/json", "User-Agent": "Food/0.1 (https://food.coffeehq.coffee)" },
      signal,
    },
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Open Food Facts returned HTTP ${response.status}.`);

  const payload = await response.json() as OpenFoodFactsResponse;
  if (payload.status === 0 || !payload.product) return null;
  const product = payload.product;
  const name = cleanText(product.product_name, 140) ?? cleanText(product.product_name_en, 140);
  if (!name) return null;

  const nutriments = product.nutriments ?? {};
  const energyKcal = numeric(nutriments["energy-kcal_100g"])
    ?? kilojoulesToCalories(numeric(nutriments["energy-kj_100g"]));
  const origin = cleanText(product.origins) ?? cleanText(product.manufacturing_places);
  const ingredients = cleanText(product.ingredients_text, 600);
  const description = [origin ? `Origin: ${origin}.` : null, ingredients ? `Ingredients: ${ingredients}` : null]
    .filter(Boolean)
    .join(" ") || null;

  return {
    name,
    barcode,
    brand: cleanText(product.brands?.split(",")[0], 100),
    packSize: cleanText(product.quantity, 80),
    imageUrl: cleanText(product.image_front_url ?? product.image_url, 500),
    category: cleanText(product.categories?.split(",")[0], 100),
    description,
    calories: energyKcal,
    proteinGrams: numeric(nutriments.proteins_100g),
    carbsGrams: numeric(nutriments.carbohydrates_100g),
    fatGrams: numeric(nutriments.fat_100g),
    saturatedFatGrams: numeric(nutriments["saturated-fat_100g"]),
    fibreGrams: numeric(nutriments.fiber_100g) ?? numeric(nutriments.fibre_100g),
    sugarGrams: numeric(nutriments.sugars_100g),
    sodiumMg: numeric(nutriments.sodium_100g) === null ? null : numeric(nutriments.sodium_100g)! * 1_000,
    source: "open-food-facts",
    confidence: 78,
  };
}

async function lookupUpcItemDb(barcode: string, signal: AbortSignal): Promise<ProductEnrichmentCandidate | null> {
  const response = await fetch(
    `https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(barcode)}`,
    { cache: "no-store", headers: { Accept: "application/json" }, signal },
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`UPCitemdb returned HTTP ${response.status}.`);
  const payload = await response.json() as UpcItemDbResponse;
  const item = payload.items?.[0];
  const name = cleanText(item?.title, 140);
  if (!name) return null;
  return {
    name,
    barcode,
    brand: cleanText(item?.brand, 100),
    category: cleanText(item?.category, 100),
    description: cleanText(item?.description, 600),
    packSize: cleanText(item?.size, 80),
    imageUrl: cleanText(item?.images?.[0], 500),
    source: "upcitemdb",
    confidence: 70,
  };
}

function serpApiCandidates(payload: SerpApiResponse) {
  return [payload.shopping_results, payload.inline_shopping_results, payload.organic_results]
    .flatMap((group) => Array.isArray(group) ? group : []) as SerpApiProductResult[];
}

async function lookupSerpApi(
  barcode: string,
  signal: AbortSignal,
  location: ResolvedSearchLocation,
): Promise<ProductEnrichmentCandidate | null> {
  const apiKey = process.env.SERPAPI_API_KEY?.trim();
  if (!apiKey || process.env.FOOD_DISABLE_SERPAPI_BARCODE === "1") return null;
  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google");
  url.searchParams.set("q", `"${barcode}"`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("gl", "au");
  url.searchParams.set("hl", "en");
  url.searchParams.set("location", location.label);

  const response = await fetch(url, { cache: "no-store", headers: { Accept: "application/json" }, signal });
  const payload = await response.json().catch(() => ({})) as SerpApiResponse;
  if (!response.ok || (typeof payload.error === "string" && payload.error.trim())) return null;
  const exact = serpApiCandidates(payload).find((result) => JSON.stringify(result).includes(barcode) && cleanText(result.title));
  const name = cleanText(exact?.title, 140);
  if (!name) return null;
  return {
    name,
    barcode,
    brand: cleanText(exact?.source, 100),
    description: cleanText(exact?.snippet, 600),
    imageUrl: cleanText(exact?.thumbnail, 500),
    source: "serpapi",
    confidence: 58,
  };
}

async function lookupBestExternalProduct(barcode: string, location: ResolvedSearchLocation) {
  const providers = [
    (signal: AbortSignal) => lookupOpenFoodFacts(barcode, signal),
    (signal: AbortSignal) => lookupUpcItemDb(barcode, signal),
    (signal: AbortSignal) => lookupSerpApi(barcode, signal, location),
  ];
  const candidates = await Promise.all(providers.map(async (provider) => {
    try {
      return await withProviderTimeout(provider);
    } catch (error) {
      console.warn("Barcode enrichment provider failed", error);
      return null;
    }
  }));
  return candidates
    .filter((candidate): candidate is ProductEnrichmentCandidate => candidate !== null)
    .sort((left, right) => candidateScore(right) - candidateScore(left))[0] ?? null;
}

function currentLocationFromUrl(url: URL): CurrentSearchLocation | null {
  if (url.searchParams.get("useCurrentLocation") !== "1") return null;
  const latitude = Number(url.searchParams.get("latitude"));
  const longitude = Number(url.searchParams.get("longitude"));
  const accuracy = Number(url.searchParams.get("accuracy"));
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude, accuracy: Number.isFinite(accuracy) && accuracy > 0 ? accuracy : null };
}

export async function GET(request: Request, context: RouteContext) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: "Sign in to scan products." }, { status: 401 });

  const { barcode: rawBarcode } = await context.params;
  const barcode = decodeURIComponent(rawBarcode).trim();
  const requestUrl = new URL(request.url);
  const refresh = requestUrl.searchParams.get("refresh") === "1";
  if (barcode.length < 4 || barcode.length > 80 || /\s/.test(barcode)) {
    return NextResponse.json({ found: false, error: "Enter a valid barcode without spaces." }, { status: 400 });
  }

  const existing = await prisma.product.findUnique({
    where: { barcode },
    select: { id: true, name: true, canonicalName: true, brand: true, barcode: true, imageUrl: true, packSize: true },
  });
  if (existing && !refresh) return productResponse(existing, "local");
  if (!supportedExternalBarcode.test(barcode)) {
    return existing ? productResponse(existing, "local") : NextResponse.json({ found: false, source: "local" });
  }

  try {
    const location = await resolveUserSearchLocation(session.user.id, currentLocationFromUrl(requestUrl));
    const candidate = await lookupBestExternalProduct(barcode, location);
    if (!candidate) {
      return existing ? productResponse(existing, "local") : NextResponse.json({ found: false, source: "external" });
    }
    const result = await enrichProductFromCandidate(candidate);
    return productResponse(
      result.product,
      candidate.source as Exclude<ProductLookupSource, "local">,
      result.changedFields,
    );
  } catch (error) {
    console.error("Unable to enrich scanned product", error);
    if (existing) return productResponse(existing, "local");
    return NextResponse.json({ found: false, error: "Product lookup is temporarily unavailable." }, { status: 502 });
  }
}
