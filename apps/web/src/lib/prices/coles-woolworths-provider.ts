import { searchGroceryProviders } from "./providers/registry";
import type { SupermarketRetailer } from "./supermarket-comparison.types";

export type RetailerCatalogueCandidate = {
  retailer: Extract<SupermarketRetailer, "Coles" | "Woolworths">;
  productName: string;
  price: number | null;
  packSize: string | null;
  isSpecial: boolean;
  sourceUrl: string | null;
  externalId: string | null;
  barcode: string | null;
  imageUrl: string | null;
};

export type RetailerPriceCandidate = Omit<RetailerCatalogueCandidate, "price"> & {
  price: number;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function detectPackSize(...values: unknown[]) {
  const text = values.map(clean).filter(Boolean).join(" ");
  return text.match(/\b\d+(?:\.\d+)?\s*(?:kg|g|l|ml|pack|pk|pieces?|capsules?|tablets?|cans?|bottles?|rolls?)\b/i)?.[0] ?? null;
}

function slugify(value: string) {
  return value
    .toLocaleLowerCase("en-AU")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function retailerProductUrl(
  retailer: Extract<SupermarketRetailer, "Coles" | "Woolworths">,
  productName: string,
  externalId: string | null,
) {
  if (!externalId) return null;
  if (retailer === "Woolworths") {
    return `https://www.woolworths.com.au/shop/productdetails/${encodeURIComponent(externalId)}`;
  }
  const slug = slugify(productName) || "product";
  return `https://www.coles.com.au/product/${slug}-${encodeURIComponent(externalId)}`;
}

export async function searchColesAndWoolworthsCatalogue(query: string): Promise<RetailerCatalogueCandidate[]> {
  const { results, errors } = await searchGroceryProviders(query, {
    limit: 15,
    storeId: process.env.COLES_STORE_ID?.trim() || null,
  });

  if (errors.length) {
    console.warn("Grocery provider catalogue search completed with errors", errors);
  }

  return results.flatMap((result): RetailerCatalogueCandidate[] => {
    if (
      (result.retailer !== "Coles" && result.retailer !== "Woolworths")
      || !result.name.trim()
    ) return [];

    const externalId = clean(result.productId) || null;
    return [{
      retailer: result.retailer,
      productName: result.name.trim(),
      price: result.price,
      packSize: detectPackSize(result.name, result.unit),
      isSpecial: false,
      sourceUrl: retailerProductUrl(result.retailer, result.name.trim(), externalId),
      externalId,
      barcode: clean(result.barcode) || null,
      imageUrl: clean(result.imageUrl) || null,
    }];
  });
}

export async function searchColesAndWoolworths(query: string): Promise<RetailerPriceCandidate[]> {
  const results = await searchColesAndWoolworthsCatalogue(query);

  return results.flatMap((result): RetailerPriceCandidate[] => {
    const hasUsablePrice = result.price !== null && Number.isFinite(result.price) && result.price > 0;
    if (!hasUsablePrice) return [];

    return [{
      ...result,
      price: result.price as number,
    }];
  });
}
