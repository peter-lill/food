import { retailerPathDepartment } from "../src/lib/products/product-category";

/**
 * Historical imports sometimes saved a display shelf or an obsolete label in
 * `aisle`. It is non-null, but cannot prove a Food department. Those records
 * need the current retailer cache just as much as records with no aisle.
 */
export function needsAuthoritativeCategoryPathRestore(aisle: string | null) {
  return retailerPathDepartment(aisle) === null;
}
