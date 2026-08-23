import { ProductType } from "@prisma/client";
import { normaliseProductText } from "../src/lib/products/product-normalisation";

export type CachedWoolworthsProduct = {
  stockcode: string;
  barcode: string | null;
  name: string;
  price: number | null;
  is_special: boolean;
  pack_size: string | null;
  image_url: string | null;
  category_path: string;
  in_stock: number | boolean;
  brand: string | null;
  description: string | null;
  long_description: string | null;
  allergens: unknown;
  dietary_claims: unknown;
  detail_refreshed_at: number | null;
};

export type ImportDisposition = "retain" | "link-barcode" | "link-name" | "create" | "skip";

const recognisedShortTailTokens = new Set(["AU", "DF", "GF", "NZ", "UK", "US", "VG", "XL", "XXL"]);

function terminalMeaningfulToken(name: string) {
  const tokens = name.trim().split(/\s+/).filter(Boolean);
  while (tokens.length) {
    const token = tokens.at(-1)!;
    if (/^(?:x\d+|\d+x|\d+(?:[.,]\d+)?(?:g|kg|ml|l)|\d+(?:pk|pack)|pack|each)$/i.test(token)) {
      tokens.pop();
      continue;
    }
    return token.replace(/[^A-Za-z]/g, "");
  }
  return "";
}

/**
 * Reject labels that end in an unrecognised one- or two-letter uppercase fragment.
 * This catches source truncation (for example `UH 1L` instead of `UHT 1L`) before
 * a controlled import can overwrite an existing retailer listing.
 */
export function hasSuspiciousLabelTail(name: string) {
  const token = terminalMeaningfulToken(name);
  return /^[A-Z]{1,2}$/.test(token) && !recognisedShortTailTokens.has(token);
}

export function categoryForWoolworthsPath(path: string): { category: string; productType: ProductType } {
  const value = path.toLocaleLowerCase("en-AU");
  if (value.includes("fruit-veg")) return { category: "Fruit & vegetables", productType: ProductType.GENERIC_PRODUCE };
  if (value.includes("meat-seafood-deli/meat")) return { category: "Meat", productType: ProductType.FRESH_MEAT };
  if (value.includes("meat-seafood-deli/seafood")) return { category: "Seafood", productType: ProductType.SEAFOOD };
  if (value.includes("dairy-eggs-fridge")) return { category: "Dairy & eggs", productType: ProductType.DAIRY };
  if (value.includes("bakery")) return { category: "Bakery", productType: ProductType.BAKERY };
  if (value.includes("freezer")) return { category: "Frozen", productType: ProductType.FROZEN };
  if (value.includes("cleaning-maintenance")) return { category: "Household", productType: ProductType.HOUSEHOLD };
  if (value.includes("drinks")) return { category: "Drinks", productType: ProductType.BEVERAGE };
  return { category: "Pantry", productType: ProductType.PACKAGED };
}

export function importEligibility(product: CachedWoolworthsProduct): { eligible: boolean; reason: string | null } {
  if (!/^\d{4,12}$/.test(product.stockcode)) return { eligible: false, reason: "missing authoritative Woolworths stockcode" };
  if (normaliseProductText(product.name).length < 3) return { eligible: false, reason: "missing usable product name" };
  if (hasSuspiciousLabelTail(product.name)) return { eligible: false, reason: "product name ends with a suspicious truncated label fragment" };
  if (!product.detail_refreshed_at) return { eligible: false, reason: "rich Woolworths detail has not been verified" };
  if (product.in_stock === false || product.in_stock === 0) return { eligible: false, reason: "product is out of stock" };
  return { eligible: true, reason: null };
}

export function cleanBarcode(value: string | null) {
  const barcode = value?.replace(/\D/g, "") ?? "";
  return /^\d{8,14}$/.test(barcode) ? barcode : null;
}

function normaliseComparableText(value: string | null) {
  return value?.toLocaleLowerCase("en-AU").replace(/[^a-z0-9]+/g, "").trim() ?? "";
}

/**
 * Woolworths sometimes supplies a brand as the only value in its short
 * description field. A brand belongs in Product.brand, not Product.description.
 */
export function canonicalWoolworthsDescription(product: Pick<CachedWoolworthsProduct, "name" | "brand" | "description" | "long_description">) {
  const brand = normaliseComparableText(product.brand);
  const name = normaliseComparableText(product.name);
  for (const candidate of [product.long_description, product.description]) {
    const value = candidate?.replace(/\s+/g, " ").trim() ?? "";
    const comparable = normaliseComparableText(value);
    if (!comparable || comparable === brand || comparable === name) continue;
    return value;
  }
  return null;
}
