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
 * A key is emitted only for an explicit product family, never merely a
 * recognised ingredient. This deliberately avoids turning ingredient-bearing
 * products such as asparagus soup or feta pizza into fresh produce or dairy.
 */
export function comparableProductCategoryKey(productName: string) {
  const identity = identifyGrocery(productName);
  const isProductFamily = identity?.evidence.includes("generic family inferred from product identity");
  // The identity engine groups flatbread and dippers for product-family display,
  // but plain flatbread is bakery and must not inherit a chilled-dip category.
  if (identity?.family === "Flatbread Dippers" && !/\bdippers?\b/i.test(productName)) return null;
  return isProductFamily && identity?.family ? normaliseProductText(identity.family) : null;
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

/** Existing data is repaired only from corroborating comparable products. */
export function canRepairImportedCategory(resolution: ImportedCategoryResolution, currentCategory: SupermarketDepartment) {
  return resolution.source === "comparable-product"
    && resolution.category !== "Other"
    && resolution.category !== currentCategory;
}
