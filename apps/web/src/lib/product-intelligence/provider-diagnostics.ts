import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const browserHeaders = {
  "Accept-Language": "en-AU,en;q=0.9",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36",
};

export type ProviderDiagnostic = {
  retailer: string;
  sourceUrl: string;
  httpStatus: number | null;
  downloaded: boolean;
  responseBytes: number;
  durationMs: number;
  markers: {
    nutrition: boolean;
    servingSize: boolean;
    servingsPerPackage: boolean;
    ingredients: boolean;
    contains: boolean;
    mayContain: boolean;
    structuredData: boolean;
  };
  error: string | null;
};

export type ProductProviderDiagnostics = {
  product: {
    id: string;
    name: string;
    productType: string;
    servingSize: string | null;
    servingsPerPackage: number | null;
    nutritionRecorded: boolean;
    ingredientsText: string | null;
    allergens: string[];
    mayContainAllergens: string[];
  };
  providers: ProviderDiagnostic[];
  missingCanonicalFields: string[];
};

type ProductRow = {
  id: string;
  name: string;
  productType: string;
  servingSize: string | null;
  servingsPerPackage: number | null;
  calories: number | null;
  proteinGrams: number | null;
  carbsGrams: number | null;
  fatGrams: number | null;
  ingredientsText: string | null;
  allergens: string[];
  mayContainAllergens: string[];
};

function marker(html: string, pattern: RegExp) {
  return pattern.test(html);
}

async function diagnoseProvider(retailer: string, sourceUrl: string): Promise<ProviderDiagnostic> {
  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch(sourceUrl, {
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
      headers: { ...browserHeaders, Accept: "text/html,application/xhtml+xml" },
    });
    const html = await response.text();
    return {
      retailer,
      sourceUrl,
      httpStatus: response.status,
      downloaded: response.ok,
      responseBytes: Buffer.byteLength(html, "utf8"),
      durationMs: Date.now() - started,
      markers: {
        nutrition: marker(html, /nutrition\s+information/i),
        servingSize: marker(html, /serving\s+size/i),
        servingsPerPackage: marker(html, /servings?\s+per\s+(?:pack|package)/i),
        ingredients: marker(html, /ingredients?/i),
        contains: marker(html, /(?:^|[>\s])contains\s*[:<]/im),
        mayContain: marker(html, /may\s+contain/i),
        structuredData: marker(html, /application\/ld\+json|__NEXT_DATA__|apollo|productDetails|nutritionInformation/i),
      },
      error: response.ok ? null : `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      retailer,
      sourceUrl,
      httpStatus: null,
      downloaded: false,
      responseBytes: 0,
      durationMs: Date.now() - started,
      markers: {
        nutrition: false,
        servingSize: false,
        servingsPerPackage: false,
        ingredients: false,
        contains: false,
        mayContain: false,
        structuredData: false,
      },
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function missingFields(product: ProductRow) {
  if (product.productType === "GENERIC_PRODUCE") return [];
  const missing: string[] = [];
  if (!product.servingSize) missing.push("Serving size");
  if (product.servingsPerPackage === null) missing.push("Servings per package");
  if ([product.calories, product.proteinGrams, product.carbsGrams, product.fatGrams].every((value) => value === null)) missing.push("Nutrition information");
  if (!product.ingredientsText) missing.push("Ingredients");
  if (!product.allergens.length && !product.mayContainAllergens.length) missing.push("Allergen statement");
  return missing;
}

export async function getProductProviderDiagnostics(productId: string): Promise<ProductProviderDiagnostics | null> {
  const rows = await prisma.$queryRaw<ProductRow[]>(Prisma.sql`
    SELECT
      "id", "name", "productType", "servingSize", "servingsPerPackage",
      "calories", "proteinGrams", "carbsGrams", "fatGrams",
      "ingredientsText", "allergens", "mayContainAllergens"
    FROM "Product"
    WHERE "id" = ${productId}
    LIMIT 1
  `);
  const product = rows[0];
  if (!product) return null;

  const listings = await prisma.storeProduct.findMany({
    where: {
      productId,
      active: true,
      productUrl: { not: null },
      retailer: { in: ["Coles", "Woolworths"] },
    },
    select: { retailer: true, productUrl: true },
    orderBy: [{ retailer: "asc" }, { updatedAt: "desc" }],
  });

  const unique = new Map<string, { retailer: string; sourceUrl: string }>();
  for (const listing of listings) {
    if (!listing.productUrl) continue;
    unique.set(`${listing.retailer}:${listing.productUrl}`, { retailer: listing.retailer, sourceUrl: listing.productUrl });
  }

  const providers = await Promise.all([...unique.values()].map((listing) => diagnoseProvider(listing.retailer, listing.sourceUrl)));

  return {
    product: {
      id: product.id,
      name: product.name,
      productType: product.productType,
      servingSize: product.servingSize,
      servingsPerPackage: product.servingsPerPackage,
      nutritionRecorded: [product.calories, product.proteinGrams, product.carbsGrams, product.fatGrams].some((value) => value !== null),
      ingredientsText: product.ingredientsText,
      allergens: product.allergens,
      mayContainAllergens: product.mayContainAllergens,
    },
    providers,
    missingCanonicalFields: missingFields(product),
  };
}
