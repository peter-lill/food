import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enrichProductFromRetailers } from "@/lib/products/retailer-product-enrichment";

export const runtime = "nodejs";

const providerTimeoutMs = 6_000;
const barcodePattern = /^\d{7,14}$/;
const rejectedImageTerms = [
  "banner", "badge", "brandmark", "favicon", "icon", "logo", "placeholder", "recipe", "sprite",
] as const;
const rejectedTitleTerms = [
  "bundle", "gift card", "hamper", "meal kit", "recipe", "serving suggestion",
] as const;
const stopWords = new Set([
  "and", "the", "with", "for", "from", "pack", "packet", "bottle", "can", "tin",
  "each", "item", "product", "g", "kg", "ml", "l",
]);

type RouteContext = { params: Promise<{ productId: string }> };
type OpenFoodFactsResponse = {
  status?: number;
  product?: { image_front_url?: string; image_front_small_url?: string; image_url?: string };
};
type WikipediaSummaryResponse = {
  type?: string;
  thumbnail?: { source?: string };
  originalimage?: { source?: string };
};
type ProductIdentity = {
  name: string;
  canonicalName: string | null;
  brand: string | null;
  barcode: string | null;
};

function normalise(value: string) {
  return value.toLocaleLowerCase("en-AU").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
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

function scoreTitle(identity: ProductIdentity, title: string, source: string) {
  const productName = identity.canonicalName ?? identity.name;
  const expectedTokens = tokens([identity.brand, productName].filter(Boolean).join(" "));
  const titleValue = normalise(title);
  const titleTokens = new Set(tokens(title));
  if (!titleValue || rejectedTitleTerms.some((term) => titleValue.includes(term))) return -Infinity;
  if (!expectedTokens.length) return -Infinity;

  const matched = expectedTokens.filter((token) => titleTokens.has(token)).length;
  const coverage = matched / expectedTokens.length;
  const nameValue = normalise(productName);
  const brandValue = normalise(identity.brand ?? "");
  let score = coverage * 100;

  if (nameValue && titleValue.includes(nameValue)) score += 40;
  if (brandValue && titleValue.includes(brandValue)) score += 25;
  if (identity.barcode && titleValue.includes(identity.barcode)) score += 80;
  if (/woolworths|coles/i.test(source)) score += 15;
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
        cache: "force-cache",
        next: { revalidate: 604_800 },
        headers: { Accept: "application/json", "User-Agent": "Food/0.1 (https://food.coffeehq.coffee)" },
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

async function imageFromWikipedia(name: string) {
  const query = name.trim();
  if (!query) return null;
  return withTimeout(async (signal) => {
    const response = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query.replace(/\s+/g, "_"))}`,
      {
        cache: "force-cache",
        next: { revalidate: 2_592_000 },
        headers: { Accept: "application/json", "Api-User-Agent": "Food/0.1 (https://food.coffeehq.coffee)" },
        signal,
      },
    );
    if (!response.ok) return null;
    const payload = await response.json() as WikipediaSummaryResponse;
    if (payload.type === "disambiguation") return null;
    return safeImageUrl(payload.originalimage?.source) ?? safeImageUrl(payload.thumbnail?.source);
  });
}

function noImageResponse() {
  return new NextResponse(null, {
    status: 404,
    headers: { "Cache-Control": "private, no-cache, max-age=60" },
  });
}

function redirectToImage(imageUrl: string) {
  const response = NextResponse.redirect(imageUrl, 307);
  response.headers.set("Cache-Control", "private, max-age=3600");
  return response;
}

function genericImageForProduct(request: Request, product: ProductIdentity) {
  const identity = normalise([product.name, product.canonicalName].filter(Boolean).join(" "));
  if (/\bmushrooms?\b/.test(identity)) {
    return new URL("/product-images/button-mushroom.svg", request.url).toString();
  }
  return null;
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
      packSize: true,
      storeProducts: {
        where: { imageUrl: { not: null } },
        select: { imageUrl: true, retailerProductName: true, retailer: true, brand: true },
        take: 8,
      },
    },
  });

  if (!product) return noImageResponse();

  const identity: ProductIdentity = {
    name: product.name,
    canonicalName: product.canonicalName,
    brand: product.brand,
    barcode: product.barcode,
  };

  const genericImage = genericImageForProduct(request, identity);
  if (genericImage) return redirectToImage(genericImage);

  const existing = safeImageUrl(product.imageUrl);
  if (existing) return redirectToImage(existing);

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

    if (!imageUrl) {
      const retailerResult = await enrichProductFromRetailers(product);
      imageUrl = safeImageUrl(retailerResult?.imageUrl);
    }

    if (!imageUrl && !product.brand && !product.barcode) {
      imageUrl = await imageFromWikipedia(product.canonicalName ?? product.name);
    }
  } catch (error) {
    console.warn("Product image enrichment failed", {
      productId: product.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  if (!imageUrl) return noImageResponse();

  await prisma.product.update({
    where: { id: product.id },
    data: { imageUrl },
  }).catch(() => undefined);

  return redirectToImage(imageUrl);
}
