import { retailerPathDepartment } from "../src/lib/products/product-category";
import { normaliseProductText } from "../src/lib/products/product-normalisation";

/**
 * Historical imports sometimes saved a display shelf or an obsolete label in
 * `aisle`. It is non-null, but cannot prove a Food department. Those records
 * need the current retailer cache just as much as records with no aisle.
 */
export function needsAuthoritativeCategoryPathRestore(aisle: string | null) {
  const path = aisle?.trim() ?? "";
  // ALDI and Drakes imports must retain the source path, not merely a Food
  // display department from an earlier import. A value such as "Dairy & eggs"
  // can be recognised, but it cannot be re-audited against the retailer and
  // must be replaced by the fresh /products/... or /category/... path.
  return retailerPathDepartment(path) === null || !/^\/(?:products|category)\//.test(path);
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

/**
 * Retailer IDs and presentation titles can change between catalogue runs, but
 * an exact product URL remains a stable retailer-owned identity. Ignore only
 * fragments and a redundant trailing slash; query strings remain part of the
 * identity when a retailer needs them to identify a product.
 */
export function canonicalRetailerProductUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    const pathname = url.pathname.replace(/\/+$/, "") || "/";
    return `${url.origin.toLocaleLowerCase("en-AU")}${pathname}${url.search}`;
  } catch {
    return null;
  }
}

type NamedCategoryPath = { name: string; categoryPath: string };

/**
 * A title can restore a category only when it is an exact normalised retailer
 * title and every matching current listing resolves to the same department.
 */
export function unambiguousRetailerNamePaths(products: readonly NamedCategoryPath[]) {
  const paths = new Map<string, string | null>();
  for (const product of products) {
    const name = normaliseProductText(product.name);
    const department = retailerPathDepartment(product.categoryPath);
    if (!name || !department) continue;
    const existing = paths.get(name);
    if (existing === undefined) {
      paths.set(name, product.categoryPath);
    } else if (retailerPathDepartment(existing) !== department) {
      paths.set(name, null);
    }
  }
  return paths;
}

type UrlCategoryPath = { productUrl: string | null; categoryPath: string };

/**
 * A URL is stronger than a retailer title, but retain the same safeguard: do
 * not restore a category if one exact URL appears under different departments.
 */
export function unambiguousRetailerUrlPaths(products: readonly UrlCategoryPath[]) {
  const paths = new Map<string, string | null>();
  for (const product of products) {
    const url = canonicalRetailerProductUrl(product.productUrl);
    const department = retailerPathDepartment(product.categoryPath);
    if (!url || !department) continue;
    const existing = paths.get(url);
    if (existing === undefined) {
      paths.set(url, product.categoryPath);
    } else if (retailerPathDepartment(existing) !== department) {
      paths.set(url, null);
    }
  }
  return paths;
}

type RetailerCatalogueIdentity = { externalId: string; name: string; productUrl: string | null };
type StoredRetailerListingIdentity = { retailer: string; externalId: string | null; retailerProductName: string; productUrl: string | null };

export type CurrentRetailerCatalogueIndex = {
  externalIds: ReadonlySet<string>;
  productUrls: ReadonlySet<string>;
};

/**
 * Build a deliberately conservative current-catalogue identity index. It is
 * used when retiring historical imports: any exact retailer identity is
 * enough to retain a record, while a missing identity is never treated as a
 * reason to overwrite its category.
 */
export function currentRetailerCatalogueIndex(products: readonly RetailerCatalogueIdentity[], retailer: "ALDI" | "Drakes") {
  const externalIds = new Set<string>();
  const productUrls = new Set<string>();
  for (const product of products) {
    const externalId = retailer === "ALDI"
      ? canonicalAldiExternalId(product.externalId)
      : product.externalId;
    if (externalId) externalIds.add(externalId);
    const productUrl = canonicalRetailerProductUrl(product.productUrl);
    if (productUrl) productUrls.add(productUrl);
  }
  return { externalIds, productUrls };
}

/**
 * Only a current retailer ID or exact URL proves that a historical listing is
 * still current. Titles are intentionally excluded: retailer titles are not
 * stable identities and otherwise preserve stale duplicate catalogue records.
 */
export function listingAppearsInCurrentRetailerCatalogue(listing: StoredRetailerListingIdentity, index: CurrentRetailerCatalogueIndex) {
  const externalId = listing.retailer === "ALDI"
    ? canonicalAldiExternalId(listing.externalId)
    : drakesProductExternalId(listing.externalId);
  if (externalId && index.externalIds.has(externalId)) return true;
  const productUrl = canonicalRetailerProductUrl(listing.productUrl);
  return Boolean(productUrl && index.productUrls.has(productUrl));
}
