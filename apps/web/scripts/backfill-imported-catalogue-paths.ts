import "dotenv/config";

import { prisma } from "../src/lib/prisma";
import { productDepartment, retailerPathDepartment } from "../src/lib/products/product-category";
import { supportedRetailerCategoryPath } from "./catalogue-import-category-evidence";
import { normaliseProductText } from "../src/lib/products/product-normalisation";
import { canonicalAldiExternalId, canonicalRetailerProductUrl, drakesProductExternalId, needsAuthoritativeCategoryPathRestore, unambiguousRetailerNamePaths, unambiguousRetailerUrlPaths } from "./imported-catalogue-path-recovery";

const apply = process.argv.includes("--apply");
const pageSize = 500;
const requestedDrakesStore = process.argv.find((argument) => argument.startsWith("--drakes-store="))?.slice("--drakes-store=".length).toLowerCase() ?? null;
if (requestedDrakesStore && !/^[a-z0-9-]{1,64}$/.test(requestedDrakesStore)) throw new Error("--drakes-store must be a Drakes store ID, for example 089.");

type CachedResponse = { status?: unknown; products?: unknown; nextOffset?: unknown; error?: unknown };
type CachedProduct = {
  externalId: string;
  name: string;
  productUrl: string | null;
  categoryPath: string;
  categoryPaths: string[];
};

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function cachedProduct(value: unknown): CachedProduct | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const externalId = text(input.external_id);
  const name = text(input.name);
  const categoryPath = text(input.category_path);
  const categoryPaths = Array.isArray(input.category_paths)
    ? input.category_paths.flatMap((value) => {
        const path = text(value);
        return path ? [path] : [];
      })
    : [];
  return externalId && name && categoryPath
    ? {
        externalId,
        name,
        productUrl: text(input.product_url),
        categoryPath,
        categoryPaths: [...new Set([...categoryPaths, categoryPath])],
      }
    : null;
}

function drakesStoreId(externalId: string | null) {
  return externalId?.match(/^([a-z0-9-]{1,64}):/)?.[1] ?? null;
}

async function cachedProducts(pathname: string, query: Record<string, string> = {}) {
  const bridgeUrl = process.env.GROCERY_MCP_BRIDGE_URL?.trim();
  if (!bridgeUrl) throw new Error("GROCERY_MCP_BRIDGE_URL is required to restore catalogue category paths.");

  const products: CachedProduct[] = [];
  let offset = 0;
  while (true) {
    const url = new URL(pathname, bridgeUrl);
    url.searchParams.set("limit", String(pageSize));
    url.searchParams.set("offset", String(offset));
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
    const response = await fetch(url, { cache: "no-store", headers: { Accept: "application/json" } });
    const payload = await response.json().catch(() => ({})) as CachedResponse;
    if (!response.ok || payload.status !== "success" || !Array.isArray(payload.products)) {
      throw new Error(text(payload.error) ?? `${pathname} returned HTTP ${response.status}.`);
    }
    products.push(...payload.products.flatMap((value) => {
      const product = cachedProduct(value);
      return product ? [product] : [];
    }));
    if (typeof payload.nextOffset !== "number" || payload.nextOffset <= offset) break;
    offset = payload.nextOffset;
  }
  return products;
}

async function main() {
  const listings = await prisma.storeProduct.findMany({
    where: { retailer: { in: ["ALDI", "Drakes"] }, active: true },
    select: {
      id: true,
      retailer: true,
      externalId: true,
      aisle: true,
      retailerProductName: true,
      productUrl: true,
      product: { select: { category: true, name: true, canonicalName: true } },
    },
  });
  const staleListings = listings.filter((listing) =>
    listing.retailer === "ALDI"
      ? true
      : needsAuthoritativeCategoryPathRestore(listing.aisle),
  );
  const aldiProducts = await cachedProducts("/aldi/catalogue/products");
  const aldiProductsById = new Map(aldiProducts.flatMap((product) => {
    const externalId = canonicalAldiExternalId(product.externalId);
    return externalId ? [[externalId, product] as const] : [];
  }));
  const aldiNamePaths = unambiguousRetailerNamePaths(aldiProducts);
  const aldiUrlPaths = unambiguousRetailerUrlPaths(aldiProducts);
  const historicalDrakesStores = [...new Set(staleListings
    .filter((listing) => listing.retailer === "Drakes")
    .flatMap((listing) => {
      const storeId = drakesStoreId(listing.externalId);
      return storeId ? [storeId] : [];
    }))];
  const drakesStores = requestedDrakesStore ? [requestedDrakesStore] : historicalDrakesStores;
  const drakesProductsById = new Map<string, CachedProduct>();
  const drakesProductsByProductId = new Map<string, CachedProduct | null>();
  const drakesProducts: CachedProduct[] = [];
  for (const storeId of drakesStores) {
    for (const product of await cachedProducts("/drakes/catalogue/products", { storeId })) {
      drakesProducts.push(product);
      drakesProductsById.set(`${storeId}:${product.externalId}`, product);

      const existing = drakesProductsByProductId.get(product.externalId);
      if (existing === undefined) {
        drakesProductsByProductId.set(product.externalId, product);
      } else if (
        existing === null
        || supportedRetailerCategoryPath(
          product.name,
          [...existing.categoryPaths, ...product.categoryPaths],
        ) === null
      ) {
        drakesProductsByProductId.set(product.externalId, null);
      }
    }
  }
  const drakesNamePaths = unambiguousRetailerNamePaths(drakesProducts);
  const drakesUrlPaths = unambiguousRetailerUrlPaths(drakesProducts);

  const updates = staleListings.flatMap((listing) => {
    const name = normaliseProductText(listing.retailerProductName ?? "");
    const currentCategory = productDepartment(
      listing.product.category,
      listing.product.canonicalName ?? listing.product.name,
    );
    const aldiProduct = listing.retailer === "ALDI"
      ? aldiProductsById.get(canonicalAldiExternalId(listing.externalId) ?? "")
      : null;
    const identifiedPath = listing.retailer === "ALDI"
      ? aldiProduct
        ? listing.aisle && aldiProduct.categoryPaths.includes(listing.aisle)
          ? listing.aisle
          : supportedRetailerCategoryPath(
              aldiProduct.name,
              aldiProduct.categoryPaths,
              currentCategory,
            )
        : null
      : listing.externalId
        ? (() => {
            const cached = drakesProductsById.get(listing.externalId)
              ?? drakesProductsByProductId.get(drakesProductExternalId(listing.externalId) ?? "")
              ?? null;
            if (!cached) return null;
            if (listing.aisle && cached.categoryPaths.includes(listing.aisle)) return listing.aisle;
            return cached.categoryPath;
          })()
        : null;
    const retailerUrl = canonicalRetailerProductUrl(listing.productUrl);
    const urlPath = retailerUrl ? (listing.retailer === "ALDI" ? aldiUrlPaths.get(retailerUrl) : drakesUrlPaths.get(retailerUrl)) : null;
    const categoryPath = identifiedPath ?? urlPath ?? (listing.retailer === "ALDI" ? aldiNamePaths.get(name) : drakesNamePaths.get(name)) ?? null;
    return categoryPath
      && retailerPathDepartment(categoryPath)
      && categoryPath !== listing.aisle
      ? [{
          id: listing.id,
          retailer: listing.retailer,
          fromPath: listing.aisle,
          categoryPath,
          source: identifiedPath ? "retailer-id" : urlPath ? "retailer-url" : "exact-retailer-name",
        }]
      : [];
  });

  const retailerCounts = Object.fromEntries(updates.reduce((counts, update) => {
    counts.set(update.retailer, (counts.get(update.retailer) ?? 0) + 1);
    return counts;
  }, new Map<string, number>()));

  console.log(`${apply ? "Updating" : "Would update"} authoritative category paths for ${updates.length} existing ALDI/Drakes listings.`);
  console.log(`Proposed updates by retailer: ${JSON.stringify(retailerCounts)}.`);

  const aldiUpdateAnalysis = updates
    .filter((update) => update.retailer === "ALDI")
    .reduce((counts, update) => {
      const listing = listings.find((candidate) => candidate.id === update.id);
      const cached = listing
        ? aldiProductsById.get(canonicalAldiExternalId(listing.externalId) ?? "")
        : null;
      const oldStillObserved = Boolean(
        listing?.aisle && cached?.categoryPaths.includes(listing.aisle),
      );
      const key = oldStillObserved ? "old-path-still-observed" : "old-path-not-observed";
      counts.set(key, (counts.get(key) ?? 0) + 1);
      return counts;
    }, new Map<string, number>());

  console.log(`ALDI old-path evidence: ${JSON.stringify(Object.fromEntries(aldiUpdateAnalysis))}.`);
  console.log(`Source cache coverage: ALDI ${aldiProductsById.size} IDs and ${[...aldiUrlPaths.values()].filter(Boolean).length} URLs; Drakes ${drakesProductsById.size} exact IDs, ${[...drakesProductsByProductId.values()].filter(Boolean).length} unique product IDs, and ${[...drakesUrlPaths.values()].filter(Boolean).length} URLs across ${drakesStores.join(", ") || "no stores"}${requestedDrakesStore ? " (selected current store)" : ""}.`);
  console.log(`Restoration evidence: ${JSON.stringify(Object.fromEntries(updates.reduce((counts, update) => {
    counts.set(update.source, (counts.get(update.source) ?? 0) + 1);
    return counts;
  }, new Map<string, number>())))}.`);
  console.log(`Resolved departments: ${JSON.stringify(Object.fromEntries(updates.reduce((counts, update) => {
    const department = retailerPathDepartment(update.categoryPath)!;
    counts.set(department, (counts.get(department) ?? 0) + 1);
    return counts;
  }, new Map<string, number>())))}.`);
  if (!apply) {
    console.log("Sample proposed changes:");
    for (const update of updates.slice(0, 30)) {
      console.log(`  ${update.retailer}: ${update.fromPath ?? "(missing)"} -> ${update.categoryPath} [${update.source}]`);
    }
    console.log("No database changes were made. Rerun with --apply after reviewing this preview.");
    return;
  }
  for (const update of updates) {
    await prisma.storeProduct.update({ where: { id: update.id }, data: { aisle: update.categoryPath } });
  }
  console.log("Imported retailer category paths restored.");
}

void main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
