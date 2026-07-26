import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const providerTimeoutMs = 6_000;
const barcodePattern = /^\d{7,14}$/;
const rejectedImageTerms = [
  "banner",
  "badge",
  "brandmark",
  "favicon",
  "icon",
  "logo",
  "placeholder",
  "recipe",
  "sprite",
] as const;
const rejectedTitleTerms = [
  "bundle",
  "gift card",
  "hamper",
  "meal kit",
  "recipe",
  "serving suggestion",
] as const;
const stopWords = new Set([
  "and", "the", "with", "for", "from", "pack", "packet", "bottle", "can", "tin",
  "each", "item", "product", "g", "kg", "ml", "l",
]);

type RouteContext = {
  params: Promise<{ productId: string }>;
};

type OpenFoodFactsResponse = {
  status?: number;
  product?: {
    image_front_url?: string;
    image_front_small_url?: string;
    image_url?: string;
  };
};

type SerpApiResult = {
  title?: unknown;
  source?: unknown;
  seller?: unknown;
  thumbnail?: unknown;
  image?: unknown;
  serpapi_thumbnail?: unknown;
};

type SerpApiResponse = {
  shopping_results?: unknown;
  inline_shopping_results?: unknown;
  error?: unknown;
};

type ProductIdentity = {
  name: string;
  canonicalName: string | null;
  brand: string | null;
  barcode: string | null;
};

type ImageCandidate = {
  imageUrl: string;
  title: string;
  source: string;
  score: number;
};

function cleanText(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function normalise(value: string) {
  return value
    .toLocaleLowerCase("en-AU")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value: string) {
  return normalise(value)
    .split(" ")
    .filter((token) => token.length > 1)
    .filter((token) => !stopWords.has(token))
    .filter((token) => !/^\d+(?:\.\d+)?$/.test(token));
}

function safeImageUrl(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    const lower = url.toString().toLocaleLowerCase("en-AU");
    if (rejectedImageTerms.some((term) => lower.includes(term))) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function trustedExistingImage(value: unknown) {
  const imageUrl = safeImageUrl(value);
  if (!imageUrl) return null;
  const host = new URL(imageUrl).hostname.toLocaleLowerCase("en-AU");
  return [
    "openfoodfacts.org",
    "images.openfoodfacts.org",
    "woolworths.com.au",
    "coles.com.au",
    "aldi.com.au",
    "costco.com.au",
  ].some((domain) => host === domain || host.endsWith(`.${domain}`))
    ? imageUrl
    : null;
}

function scoreTitle(identity: ProductIdentity, title: string, source: string) {
  const productName = identity.canonicalName ?? identity.name;
  const expectedTokens = tokens([identity.brand, productName].filter(Boolean).join(" "));
  const titleValue = normalise(title);
  const titleTokens = new Set(tokens(title));
  if (!titleValue || rejectedTitleTerms.some((term) => titleValue.includes(term))) return -Infinity;
  if (expectedTokens.length === 0) return -Infinity;

  const matched = expectedTokens.filter((token) => titleTokens.has(token)).length;
  const coverage = matched / expectedTokens.length;
  const nameValue = normalise(productName);
  const brandValue = normalise(identity.brand ?? "");
  let score = coverage * 100;

  if (nameValue && titleValue.includes(nameValue)) score += 40;
  if (brandValue && titleValue.includes(brandValue)) score += 25;
  if (identity.barcode && titleValue.includes(identity.barcode)) score += 80;
  if (/woolworths|coles|aldi|costco/i.test(source)) score += 10;
  if (coverage < 0.6) return -Infinity;
  if (identity.brand && !titleValue.includes(brandValue) && coverage < 0.8) return -Infinity;

  return score;
}

async function withTimeout<T>(work: (signal: AbortSignal) => Promise<T>) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), providerTimeoutMs);
  try {
    return await work(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

async function imageFromOpenFoodFacts(barcode: string) {
  if (!barcodePattern.test(barcode)) return null;

  return withTimeout(async (signal) => {
    const fields = "status,image_front_url,image_front_small_url,image_url";
    const response = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=${fields}`,
      {
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "User-Agent": "Food/0.1 (https://food.coffeehq.coffee)",
        },
        signal,
      },
    );
    if (!response.ok) return null;
    const payload = await response.json() as OpenFoodFactsResponse;
    if (payload.status === 0) return null;
    return safeImageUrl(payload.product?.image_front_url)
      ?? safeImageUrl(payload.product?.image_front_small_url)
      ?? safeImageUrl(payload.product?.image_url);
  });
}

async function imageFromShoppingSearch(identity: ProductIdentity) {
  const apiKey = process.env.SERPAPI_API_KEY?.trim();
  const productName = identity.canonicalName ?? identity.name;
  const query = [identity.brand, productName, identity.barcode].filter(Boolean).join(" ");
  if (!apiKey || !query.trim()) return null;

  return withTimeout(async (signal) => {
    const url = new URL("https://serpapi.com/search.json");
    url.searchParams.set("engine", "google_shopping");
    url.searchParams.set("q", query);
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("gl", "au");
    url.searchParams.set("hl", "en");

    const response = await fetch(url, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal,
    });
    if (!response.ok) return null;

    const payload = await response.json() as SerpApiResponse;
    if (typeof payload.error === "string" && payload.error.trim()) return null;
    const results = [
      ...(Array.isArray(payload.shopping_results) ? payload.shopping_results : []),
      ...(Array.isArray(payload.inline_shopping_results) ? payload.inline_shopping_results : []),
    ] as SerpApiResult[];

    const candidates = results
      .map((result): ImageCandidate | null => {
        const title = cleanText(result.title);
        const source = cleanText(result.source) || cleanText(result.seller);
        const imageUrl = safeImageUrl(result.image)
          ?? safeImageUrl(result.thumbnail)
          ?? safeImageUrl(result.serpapi_thumbnail);
        if (!title || !imageUrl) return null;
        const score = scoreTitle(identity, title, source);
        return Number.isFinite(score) ? { imageUrl, title, source, score } : null;
      })
      .filter((candidate): candidate is ImageCandidate => candidate !== null)
      .sort((left, right) => right.score - left.score);

    return candidates[0]?.imageUrl ?? null;
  });
}

export async function GET(request: Request, context: RouteContext) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return new NextResponse(null, { status: 401 });

  const { productId } = await context.params;
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      name: true,
      canonicalName: true,
      brand: true,
      barcode: true,
      imageUrl: true,
      storeProducts: {
        where: { imageUrl: { not: null } },
        select: {
          imageUrl: true,
          retailerProductName: true,
          retailer: true,
          brand: true,
        },
        take: 8,
      },
    },
  });

  if (!product) return new NextResponse(null, { status: 404 });

  const identity: ProductIdentity = {
    name: product.name,
    canonicalName: product.canonicalName,
    brand: product.brand,
    barcode: product.barcode,
  };

  let imageUrl: string | null = null;
  try {
    if (product.barcode) imageUrl = await imageFromOpenFoodFacts(product.barcode);

    if (!imageUrl) {
      const storeCandidates = product.storeProducts
        .map((listing) => {
          const candidateUrl = safeImageUrl(listing.imageUrl);
          if (!candidateUrl) return null;
          const score = scoreTitle(
            identity,
            [listing.brand, listing.retailerProductName].filter(Boolean).join(" "),
            listing.retailer,
          );
          return Number.isFinite(score) ? { imageUrl: candidateUrl, score } : null;
        })
        .filter((candidate): candidate is { imageUrl: string; score: number } => candidate !== null)
        .sort((left, right) => right.score - left.score);
      imageUrl = storeCandidates[0]?.imageUrl ?? null;
    }

    if (!imageUrl) imageUrl = trustedExistingImage(product.imageUrl);
    if (!imageUrl) imageUrl = await imageFromShoppingSearch(identity);
  } catch (error) {
    console.warn("Product image enrichment failed", {
      productId: product.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  if (!imageUrl) return new NextResponse(null, { status: 404 });

  if (imageUrl !== product.imageUrl) {
    await prisma.product.update({
      where: { id: product.id },
      data: { imageUrl },
    }).catch(() => undefined);
  }

  const response = NextResponse.redirect(imageUrl, 307);
  response.headers.set("Cache-Control", "private, max-age=86400");
  return response;
}
