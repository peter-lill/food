import { ProductType } from "@prisma/client";
import type { SupermarketDepartment } from "../src/lib/products/product-category";

function expectedProductTypes(category: SupermarketDepartment): Set<ProductType> {
  switch (category) {
    case "Fruit & vegetables": return new Set([ProductType.GENERIC_PRODUCE]);
    case "Bakery": return new Set([ProductType.BAKERY]);
    case "Meat & seafood": return new Set([ProductType.FRESH_MEAT, ProductType.SEAFOOD]);
    case "Dairy & eggs": return new Set([ProductType.DAIRY]);
    case "Frozen": return new Set([ProductType.FROZEN]);
    case "Drinks": return new Set([ProductType.BEVERAGE]);
    case "Health & personal care": return new Set([ProductType.PERSONAL_CARE]);
    case "Household": return new Set([ProductType.HOUSEHOLD]);
    case "Deli":
    case "Pantry":
    case "Confectionery":
    case "Baby":
    case "Pet": return new Set([ProductType.PACKAGED]);
    case "Other": return new Set([ProductType.OTHER]);
  }
}

/**
 * PACKAGED describes the form of a product, not its supermarket department.
 * A packaged loaf, yoghurt, frozen meal, or bag of produce remains correctly
 * categorised by its retailer department. OTHER is retained for legacy
 * records whose physical type has not yet been enriched, so it cannot safely
 * contradict an otherwise authoritative category either.
 */
export function isProductTypeCompatibleWithDepartment(category: SupermarketDepartment, productType: ProductType) {
  if (productType === ProductType.PACKAGED || productType === ProductType.OTHER) return true;
  return expectedProductTypes(category).has(productType);
}
