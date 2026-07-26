import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const providerTimeoutMs = 6_000;
const barcodePattern = /^\d{7,14}$/;

type RouteContext = {
  params: Promise<{ productId: string }>;
};

type OpenFoodFactsResponse = {
  status?: number;
  product?: {
    image_front_url?: string;
    image_url?: string;
  };
};

type SerpApiResult = {
  thumbnail?: unknown;
  image?: unknown;
  serpapi_thumbnail?: unknown;
};

type SerpApiResponse = {
  shopping_results?: unknown;
  inline_shopping_results?: unknown;
  error?: unknown;
};

function safeImageUrl(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
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
    const fields = "status,image_front_url,image_url";
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
      ?? safeImageUrl(payload.product?.image_url);
  });
}

async function imageFromShoppingSearch(query: string) {
  const apiKey = process.env.SERPAPI_API_KEY?.trim();
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

    for (const result of results) {
      const image = safeImageUrl(result.thumbnail)
        ?? safeImageUrl(result.image)
        ?? safeImageUrl(result.serpapi_thumbnail);
      if (image) return image;
    }
    return null;
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
        select: { imageUrl: true },
        take: 1,
      },
    },
  });

  if (!product) return new NextResponse(null, { status: 404 });

  const existing = safeImageUrl(product.imageUrl)
    ?? safeImageUrl(product.storeProducts[0]?.imageUrl);
  if (existing) return NextResponse.redirect(existing, 307);

  let imageUrl: string | null = null;
  try {
    if (product.barcode) imageUrl = await imageFromOpenFoodFacts(product.barcode);
    if (!imageUrl) {
      imageUrl = await imageFromShoppingSearch(
        [product.brand, product.canonicalName ?? product.name].filter(Boolean).join(" "),
      );
    }
  } catch (error) {
    console.warn("Product image enrichment failed", {
      productId: product.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  if (!imageUrl) return new NextResponse(null, { status: 404 });

  await prisma.product.update({
    where: { id: product.id },
    data: { imageUrl },
  }).catch(() => undefined);

  return NextResponse.redirect(imageUrl, 307);
}
