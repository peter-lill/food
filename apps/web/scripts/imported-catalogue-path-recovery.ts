import { retailerPathDepartment } from "../src/lib/products/product-category";

/**
 * Historical imports sometimes saved a display shelf or an obsolete label in
 * `aisle`. It is non-null, but cannot prove a Food department. Those records
 * need the current retailer cache just as much as records with no aisle.
 */
export function needsAuthoritativeCategoryPathRestore(aisle: string | null) {
  return retailerPathDepartment(aisle) === null;
}

/** ALDI's historical data sometimes retained zero-padded numeric identifiers. */
export function canonicalAldiExternalId(externalId: string | null) {
  if (!externalId || !/^\d+$/.test(externalId)) return null;
  return externalId.replace(/^0+/, "") || "0";
}

/** A Drakes listing is stored as `storeId:product-slug`; the slug is stable. */
export function drakesProductExternalId(externalId: string | null) {
  const match = externalId?.match(/^[a-z0-9-]{1,64}:([a-z0-9-]+)$/);
  return match?.[1] ?? null;
}
