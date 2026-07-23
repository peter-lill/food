import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const supportedExternalBarcode = /^\d{7,14}$/;
const lookupTimeoutMs = 8_000;

type RouteContext = {
  params: Promise<{ barcode: string }>;
};

type OpenFoodFactsProduct = {
  product_name?: string;
  product_name_en?: string;
  brands?: string;
};

type OpenFoodFactsResponse = {
  product?: OpenFoodFactsProduct;
};

function cleanText(value: unknown, maximumLength: number) {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.slice(0, maximumLength) : null;
}

function productResponse(
  product: { id: string; name: string; brand: string | null; barcode: string | null },
  source: "local" | "open-food-facts",
) {
  return NextResponse.json({
    found: true,
    source,
    product,
  });
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
    return NextResponse.json({ found: false, source: "open-food-facts" });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), lookupTimeoutMs);

  try {
    const fields = "product_name,product_name_en,brands";
    const response = await fetch(
      `https://world.openfoodfacts.org/api/v3/product/${encodeURIComponent(barcode)}?fields=${fields}`,
      {
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "User-Agent": "Food/0.1 (https://food.coffeehq.coffee)",
        },
        signal: controller.signal,
      },
    );

    if (response.status === 404) {
      return NextResponse.json({ found: false, source: "open-food-facts" });
    }

    if (!response.ok) {
      throw new Error(`Open Food Facts returned HTTP ${response.status}.`);
    }

    const payload = await response.json() as OpenFoodFactsResponse;
    const externalProduct = payload.product;
    const name = cleanText(externalProduct?.product_name, 100)
      ?? cleanText(externalProduct?.product_name_en, 100);
    const brand = cleanText(externalProduct?.brands?.split(",")[0], 100);

    if (!name) {
      return NextResponse.json({ found: false, source: "open-food-facts" });
    }

    const saved = await prisma.product.upsert({
      where: { barcode },
      update: {
        name,
        ...(brand ? { brand } : {}),
      },
      create: {
        name,
        brand,
        barcode,
      },
      select: { id: true, name: true, brand: true, barcode: true },
    });

    return productResponse(saved, "open-food-facts");
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
