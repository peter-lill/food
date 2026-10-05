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
  const countFirst = normalised.match(/(\d+)\s*x\s*(\d+(?:\.\d+)?)\s*(kg|g|l|ml)\b/i);
  const sizeFirst = normalised.match(/(\d+(?:\.\d+)?)\s*(kg|g|l|ml)\s*x\s*(\d+)\s*(?:pack|pk)?\b/i);
  const multipack = countFirst
    ? { count: Number(countFirst[1]), amount: Number(countFirst[2]), unit: countFirst[3].toLowerCase() }
    : sizeFirst
      ? { count: Number(sizeFirst[3]), amount: Number(sizeFirst[1]), unit: sizeFirst[2].toLowerCase() }
      : null;
  if (multipack) {
    const baseAmount = multipack.unit === "kg" ? multipack.amount * 1000 : multipack.unit === "l" ? multipack.amount * 1000 : multipack.amount;
    const baseUnit = multipack.unit === "kg" ? "g" : multipack.unit === "l" ? "ml" : multipack.unit;
    return `${multipack.count}x${baseAmount}${baseUnit}`;
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
function packagedKey(product: ComparableRetailProduct) {
  const brand = normaliseProductText(product.brand ?? "");
  if (!brand) return null;
  const pack = comparablePackSize(product.packSize) ?? comparablePackSize(product.name);
  if (!pack) return null;
  const name = comparableName(product);
  if (!name || name.length < 2) return null;
  return `packaged:${brand}:${name}:${pack}`;
}

export function comparableRetailProductKey(product: ComparableRetailProduct) {
  const barcode = normaliseBarcode(product.barcode);
  return barcode ? `barcode:${barcode}` : packagedKey(product);
}

export function sameComparableRetailProduct(left: ComparableRetailProduct, right: ComparableRetailProduct) {
  const leftBarcode = normaliseBarcode(left.barcode);
  const rightBarcode = normaliseBarcode(right.barcode);
  if (leftBarcode && rightBarcode) return leftBarcode === rightBarcode;

  const leftKey = packagedKey(left);
  const rightKey = packagedKey(right);
  return Boolean(leftKey && rightKey && leftKey === rightKey);
}
