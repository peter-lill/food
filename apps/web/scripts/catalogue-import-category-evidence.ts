import { ProductType } from "@prisma/client";
import { identifyGrocery } from "../src/lib/grocery-intelligence/identity";
import { productDepartment, type SupermarketDepartment } from "../src/lib/products/product-category";
import { normaliseProductText } from "../src/lib/products/product-normalisation";

export type ImportedCategoryResolution = {
  category: SupermarketDepartment;
  productType: ProductType;
  source: "comparable-product" | "name-rules";
};

function productTypeForDepartment(category: SupermarketDepartment): ProductType {
  switch (category) {
    case "Fruit & vegetables": return ProductType.GENERIC_PRODUCE;
    case "Bakery": return ProductType.BAKERY;
    case "Meat & seafood": return ProductType.FRESH_MEAT;
    case "Dairy & eggs": return ProductType.DAIRY;
    case "Frozen": return ProductType.FROZEN;
    case "Drinks": return ProductType.BEVERAGE;
    case "Health & personal care": return ProductType.PERSONAL_CARE;
    case "Household": return ProductType.HOUSEHOLD;
    case "Deli":
    case "Pantry":
    case "Confectionery":
    case "Baby":
    case "Pet": return ProductType.PACKAGED;
    case "Other": return ProductType.OTHER;
  }
}

/**
 * A key is only emitted where the grocery identity engine found a recognised
 * product concept or a stable product family. This deliberately avoids using
 * arbitrary overlapping words (for example, "tea" in "tea towels").
 */
export function comparableProductCategoryKey(productName: string) {
  const identity = identifyGrocery(productName);
  if (!identity) return null;
  const reliable = identity.evidence.includes("protected grocery concept matched") || identity.family !== null;
  return reliable ? normaliseProductText(identity.family ?? identity.canonicalName) : null;
}

export function categoryResolutionForImport(
  productName: string,
  comparableCategories: ReadonlyMap<string, ReadonlySet<SupermarketDepartment>>,
): ImportedCategoryResolution {
  const comparableKey = comparableProductCategoryKey(productName);
  const candidates = comparableKey ? comparableCategories.get(comparableKey) : undefined;
  if (candidates?.size === 1) {
    const [category] = candidates;
    if (category && category !== "Other") {
      return { category, productType: productTypeForDepartment(category), source: "comparable-product" };
    }
  }

  const category = productDepartment("Other", productName);
  return { category, productType: productTypeForDepartment(category), source: "name-rules" };
}
