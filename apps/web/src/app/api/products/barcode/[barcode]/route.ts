import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const supportedExternalBarcode = /^\d{7,14}$/;
const lookupTimeoutMs = 10_000;

type RouteContext = {
  params: Promise<{ barcode: string }>;
};

type ProductLookupSource = "local" | "open-food-facts" | "upcitemdb";

type ExternalProduct = {
  name: string;
  brand: string | null;
  source: Exclude<ProductLookupSource, "local">;
};

type OpenFoodFactsProduct = {
  product_name?: string;
  product_name_en?: string;
  brands?: string;
};

type OpenFoodFactsResponse = {
  status?: number;
  product?: OpenFoodFactsProduct;
};

type UpcItemDbItem = {
  title?: string;
  brand?: string;
};

type UpcItemDbResponse = {
  code?: string;
  total?: number;
  items?: UpcItemDbItem[];
};

function cleanText(value: unknown, maximumLength: number) {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.slice(0, maximumLength) : null;
}

function productResponse(
  product: { id: string; name: string; brand: string | null; barcode: string | null },
  source: ProductLookupSource,
) {
  return NextResponse.json({
    found: true,
    source,
    product,
  });
}

async function lookupOpenFoodFacts(
  barcode: string,
  signal: AbortSignal,
): Promise<ExternalProduct | null> {
  const fields = "status,product_name,product_name_en,brands";
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

  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Open Food Facts returned HTTP ${response.status}.`);
  }

  const payload = await response.json() as OpenFoodFactsResponse;
  if (payload.status === 0) return null;

  const product = payload.product;
  const name = cleanText(product?.product_name, 100)
    ?? cleanText(product?.product_name_en, 100);
  const brand = cleanText(product?.brands?.split(",")[0], 100);

  return name ? { name, brand, source: "open-food-facts" } : null;
}

async function lookupUpcItemDb(
  barcode: string,
  signal: AbortSignal,
): Promise<ExternalProduct | null> {
  const response = await fetch(
    `https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(barcode)}`,
    {
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      signal,
    },
  );

  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`UPCitemdb returned HTTP ${response.status}.`);
  }

  const payload = await response.json() as UpcItemDbResponse;
  const item = payload.items?.[0];
  const name = cleanText(item?.title, 100);
  const brand = cleanText(item?.brand, 100);

  return name ? { name, brand, source: "upcitemdb" } : null;
}

async function lookupExternalProduct(
  barcode: string,
  signal: AbortSignal,
): Promise<ExternalProduct | null> {
  const providerErrors: Error[] = [];

  try {
    const product = await lookupOpenFoodFacts(barcode, signal);
    if (product) return product;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    providerErrors.push(error instanceof Error ? error : new Error("Open Food Facts lookup failed."));
  }

  try {
    const product = await lookupUpcItemDb(barcode, signal);
    if (product) return product;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    providerErrors.push(error instanceof Error ? error : new Error("UPCitemdb lookup failed."));
  }

  if (providerErrors.length === 2) {
    throw new AggregateError(providerErrors, "All barcode lookup providers failed.");
  }

  return null;
}

export async function GET(_request: Request, context: RouteContext) {
  const { barcode: rawBarcode } = await context.params;
  const barcode = decodeURIComponent(rawBarcode).trim();

  if (barcode.length < 4 || barcode.length > 80 || /\s/.test(barcode)) {
    return NextResponse.json(
      { found: false, error: "Enter a valid barcode without spaces." },
      { status: 400 },
    );
  }

  const existing = await prisma.product.findUnique({
    where: { barcode },
    select: { id: true, name: true, brand: true, barcode: true },
  });

  if (existing) return productResponse(existing, "local");

  if (!supportedExternalBarcode.test(barcode)) {
    return NextResponse.json({ found: false, source: "local" });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), lookupTimeoutMs);

  try {
    const externalProduct = await lookupExternalProduct(barcode, controller.signal);

    if (!externalProduct) {
      return NextResponse.json({ found: false, source: "external" });
    }

    const saved = await prisma.product.upsert({
      where: { barcode },
      update: {
        name: externalProduct.name,
        ...(externalProduct.brand ? { brand: externalProduct.brand } : {}),
      },
      create: {
        name: externalProduct.name,
        brand: externalProduct.brand,
        barcode,
      },
      select: { id: true, name: true, brand: true, barcode: true },
    });

    return productResponse(saved, externalProduct.source);
  } catch (error) {
    console.error("Unable to look up barcode", error);
    const timedOut = error instanceof Error && error.name === "AbortError";

    return NextResponse.json(
      {
        found: false,
        error: timedOut
          ? "Product lookup timed out."
          : "Product lookup is temporarily unavailable.",
      },
      { status: timedOut ? 504 : 502 },
    );
  } finally {
    clearTimeout(timeout);
  }
}
