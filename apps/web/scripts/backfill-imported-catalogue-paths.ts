import "dotenv/config";

import { prisma } from "../src/lib/prisma";
import { retailerPathDepartment } from "../src/lib/products/product-category";
import { normaliseProductText } from "../src/lib/products/product-normalisation";
import { canonicalAldiExternalId, canonicalRetailerProductUrl, drakesProductExternalId, needsAuthoritativeCategoryPathRestore, unambiguousRetailerNamePaths, unambiguousRetailerUrlPaths } from "./imported-catalogue-path-recovery";

const apply = process.argv.includes("--apply");
const pageSize = 500;
const requestedDrakesStore = process.argv.find((argument) => argument.startsWith("--drakes-store="))?.slice("--drakes-store=".length).toLowerCase() ?? null;
if (requestedDrakesStore && !/^[a-z0-9-]{1,64}$/.test(requestedDrakesStore)) throw new Error("--drakes-store must be a Drakes store ID, for example 089.");

type CachedResponse = { status?: unknown; products?: unknown; nextOffset?: unknown; error?: unknown };
type CachedProduct = { externalId: string; name: string; productUrl: string | null; categoryPath: string };

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function cachedProduct(value: unknown): CachedProduct | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const externalId = text(input.external_id);
  const name = text(input.name);
  const categoryPath = text(input.category_path);
  return externalId && name && categoryPath ? { externalId, name, productUrl: text(input.product_url), categoryPath } : null;
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
    select: { id: true, retailer: true, externalId: true, aisle: true, retailerProductName: true, productUrl: true },
  });
  const staleListings = listings.filter((listing) => needsAuthoritativeCategoryPathRestore(listing.aisle));
  const aldiProducts = await cachedProducts("/aldi/catalogue/products");
  const aldiPaths = new Map(aldiProducts.flatMap((product) => {
    const externalId = canonicalAldiExternalId(product.externalId);
    return externalId ? [[externalId, product.categoryPath] as const] : [];
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
  const drakesPaths = new Map<string, string>();
  const drakesFallbackPaths = new Map<string, string | null>();
  const drakesProducts: CachedProduct[] = [];
  for (const storeId of drakesStores) {
    for (const product of await cachedProducts("/drakes/catalogue/products", { storeId })) {
      drakesProducts.push(product);
      drakesPaths.set(`${storeId}:${product.externalId}`, product.categoryPath);
      const productId = product.externalId;
      const currentPath = drakesFallbackPaths.get(productId);
      if (currentPath === undefined) {
        drakesFallbackPaths.set(productId, product.categoryPath);
      } else if (retailerPathDepartment(currentPath) !== retailerPathDepartment(product.categoryPath)) {
        drakesFallbackPaths.set(productId, null);
      }
    }
  }
  const drakesNamePaths = unambiguousRetailerNamePaths(drakesProducts);
  const drakesUrlPaths = unambiguousRetailerUrlPaths(drakesProducts);

  const updates = staleListings.flatMap((listing) => {
    const name = normaliseProductText(listing.retailerProductName ?? "");
    const identifiedPath = listing.retailer === "ALDI"
      ? aldiPaths.get(canonicalAldiExternalId(listing.externalId) ?? "")
      : listing.externalId ? drakesPaths.get(listing.externalId) ?? drakesFallbackPaths.get(drakesProductExternalId(listing.externalId) ?? "") : null;
    const retailerUrl = canonicalRetailerProductUrl(listing.productUrl);
    const urlPath = retailerUrl ? (listing.retailer === "ALDI" ? aldiUrlPaths.get(retailerUrl) : drakesUrlPaths.get(retailerUrl)) : null;
    const categoryPath = identifiedPath ?? urlPath ?? (listing.retailer === "ALDI" ? aldiNamePaths.get(name) : drakesNamePaths.get(name)) ?? null;
    return categoryPath && retailerPathDepartment(categoryPath)
      ? [{ id: listing.id, retailer: listing.retailer, categoryPath, source: identifiedPath ? "retailer-id" : urlPath ? "retailer-url" : "exact-retailer-name" }]
      : [];
  });

  console.log(`${apply ? "Restoring" : "Would restore"} authoritative category paths for ${updates.length} of ${staleListings.length} ALDI/Drakes listings with missing or unrecognised paths.`);
  console.log(`Source cache coverage: ALDI ${aldiPaths.size} IDs and ${[...aldiUrlPaths.values()].filter(Boolean).length} URLs; Drakes ${drakesPaths.size} exact IDs, ${[...drakesFallbackPaths.values()].filter(Boolean).length} unique product IDs, and ${[...drakesUrlPaths.values()].filter(Boolean).length} URLs across ${drakesStores.join(", ") || "no stores"}${requestedDrakesStore ? " (selected current store)" : ""}.`);
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
