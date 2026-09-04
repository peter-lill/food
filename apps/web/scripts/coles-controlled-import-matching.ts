import { ProductType } from "@prisma/client";
import { normaliseProductText } from "../src/lib/products/product-normalisation";
import { hasSuspiciousLabelTail } from "./woolworths-controlled-import-matching";

export type CachedColesProduct = {
  external_id: string; barcode: string | null; name: string; brand: string | null;
  description: string | null; long_description: string | null; pack_size: string | null;
  price: number | null; was_price: number | null; is_special: number | boolean;
  in_stock: number | boolean; image_url: string | null; category_path: string; category_paths: string[];
};

export function categoryForColesPath(path: string) {
  const root = path.toLocaleLowerCase("en-AU").split(/[/?#]/).filter(Boolean).at(1) ?? "";
  if (root === "fruit-vegetables") return { category: "Fruit & vegetables", productType: ProductType.GENERIC_PRODUCE };
  if (root === "meat-seafood") return { category: "Meat & seafood", productType: ProductType.FRESH_MEAT };
  if (root === "deli") return { category: "Deli", productType: ProductType.PACKAGED };
  if (root === "dairy-eggs-fridge") return { category: "Dairy & eggs", productType: ProductType.DAIRY };
  if (root === "bakery") return { category: "Bakery", productType: ProductType.BAKERY };
  if (root === "frozen") return { category: "Frozen", productType: ProductType.FROZEN };
  if (root === "pantry" || root === "dietary-world-foods") return { category: "Pantry", productType: ProductType.PACKAGED };
  if (root === "chips-chocolates-snacks") return { category: "Confectionery", productType: ProductType.PACKAGED };
  if (root === "drinks") return { category: "Drinks", productType: ProductType.BEVERAGE };
  if (root === "cleaning-laundry") return { category: "Household", productType: ProductType.HOUSEHOLD };
  if (root === "health-beauty") return { category: "Health & personal care", productType: ProductType.PERSONAL_CARE };
  if (root === "baby") return { category: "Baby", productType: ProductType.PACKAGED };
  if (root === "pet") return { category: "Pet", productType: ProductType.PACKAGED };
  return { category: "Other", productType: ProductType.OTHER };
}

export function cleanColesBarcode(value: string | null) {
  const barcode = value?.replace(/\D/g, "") ?? "";
  return /^\d{8,14}$/.test(barcode) ? barcode : null;
}

export function colesImportEligibility(product: CachedColesProduct) {
  if (!/^\d{4,12}$/.test(product.external_id)) return { eligible: false, reason: "missing authoritative Coles product ID" };
  if (normaliseProductText(product.name).length < 3) return { eligible: false, reason: "missing usable product name" };
  if (hasSuspiciousLabelTail(product.name)) return { eligible: false, reason: "product name ends with a suspicious truncated label fragment" };
  if (!product.category_path.startsWith("/browse/")) return { eligible: false, reason: "missing authoritative Coles category path" };
  if (product.in_stock === false || product.in_stock === 0) return { eligible: false, reason: "product is out of stock" };
  return { eligible: true, reason: null };
}

export function canonicalColesDescription(product: Pick<CachedColesProduct, "name" | "brand" | "description" | "long_description">) {
  const comparable = (value: string | null) => normaliseProductText(value ?? "");
  for (const candidate of [product.long_description, product.description]) {
    const value = candidate?.replace(/\s+/g, " ").trim() ?? "";
    if (value && comparable(value) !== comparable(product.brand) && comparable(value) !== comparable(product.name)) return value;
  }
  return null;
}
