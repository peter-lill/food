import { normaliseProductText } from "@/lib/products/product-normalisation";

export type ComparableRetailProduct = {
  name: string;
  canonicalName?: string | null;
  brand?: string | null;
  packSize?: string | null;
  barcode?: string | null;
};

const retailerTokens = new Set(["coles", "woolworths", "aldi", "drakes"]);
const packagingTokens = new Set([
  "bottle", "bottles", "can", "cans", "carton", "cartons", "pack", "packs", "packet", "packets",
  "pk", "each", "ea",
]);

function normaliseBarcode(value: string | null | undefined) {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits.length >= 7 ? digits : null;
}

export function comparablePackSize(value: string | null | undefined) {
  const normalised = normaliseProductText(value ?? "");
  const multipack = normalised.match(/(\d+)\s*x\s*(\d+(?:\.\d+)?)\s*(kg|g|l|ml)\b/i);
  if (multipack) {
    const count = Number(multipack[1]);
    const amount = Number(multipack[2]);
    const unit = multipack[3].toLowerCase();
    const baseAmount = unit === "kg" ? amount * 1000 : unit === "l" ? amount * 1000 : amount;
    const baseUnit = unit === "kg" ? "g" : unit === "l" ? "ml" : unit;
    return `${count}x${baseAmount}${baseUnit}`;
  }
  const single = normalised.match(/(\d+(?:\.\d+)?)\s*(kg|g|l|ml)\b/i);
  if (single) {
    const amount = Number(single[1]);
    const unit = single[2].toLowerCase();
    if (unit === "kg") return `${amount * 1000}g`;
    if (unit === "l") return `${amount * 1000}ml`;
    return `${amount}${unit}`;
  }
  const count = normalised.match(/\b(\d+)\s*(?:pack|pk)\b/i);
  return count ? `${Number(count[1])}pack` : null;
}

function comparableName(product: ComparableRetailProduct) {
  const brand = normaliseProductText(product.brand ?? "");
  const brandTokens = new Set(brand.split(" ").filter(Boolean));
  const source = normaliseProductText(product.canonicalName?.trim() || product.name);
  const withoutMeasures = source
    .replace(/\b\d+\s*x\s*\d+(?:\.\d+)?\s*(?:kg|g|l|ml)\b/g, " ")
    .replace(/\b\d+(?:\.\d+)?\s*(?:kg|g|l|ml)\b/g, " ")
    .replace(/\b\d+\s*(?:pack|pk)\b/g, " ");
  return withoutMeasures
    .split(" ")
    .filter(Boolean)
    .filter((token) => !retailerTokens.has(token))
    .filter((token) => !packagingTokens.has(token))
    .filter((token) => !brandTokens.has(token))
    .join(" ")
    .replace(/\bsoft drink\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Conservative cross-retailer identity for packaged catalogue products.
 *
 * Barcode remains authoritative when present. Without a shared barcode we only
 * compare branded products with the same sellable pack size and the same
 * distinctive product wording after retailer/packaging noise is removed.
 * Unbranded products deliberately return null: an exact alias or the existing
 * generic-produce matcher must resolve those instead.
 */
export function comparableRetailProductKey(product: ComparableRetailProduct) {
  const barcode = normaliseBarcode(product.barcode);
  if (barcode) return `barcode:${barcode}`;

  const brand = normaliseProductText(product.brand ?? "");
  if (!brand) return null;
  const pack = comparablePackSize(product.packSize) ?? comparablePackSize(product.name);
  if (!pack) return null;
  const name = comparableName(product);
  if (!name || name.length < 2) return null;
  return `packaged:${brand}:${name}:${pack}`;
}

export function sameComparableRetailProduct(left: ComparableRetailProduct, right: ComparableRetailProduct) {
  const leftBarcode = normaliseBarcode(left.barcode);
  const rightBarcode = normaliseBarcode(right.barcode);
  if (leftBarcode && rightBarcode) return leftBarcode === rightBarcode;
  if (leftBarcode && rightBarcode && leftBarcode !== rightBarcode) return false;

  const leftKey = comparableRetailProductKey(left);
  const rightKey = comparableRetailProductKey(right);
  return Boolean(leftKey && rightKey && leftKey === rightKey);
}
