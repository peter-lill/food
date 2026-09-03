import "dotenv/config";

import { prisma } from "../src/lib/prisma";
import { retailerPathDepartment } from "../src/lib/products/product-category";
import { needsAuthoritativeCategoryPathRestore } from "./imported-catalogue-path-recovery";

const apply = process.argv.includes("--apply");
const pageSize = 500;

type CachedResponse = { status?: unknown; products?: unknown; nextOffset?: unknown; error?: unknown };
type CachedProduct = { externalId: string; categoryPath: string };

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function cachedProduct(value: unknown): CachedProduct | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const externalId = text(input.external_id);
  const categoryPath = text(input.category_path);
  return externalId && categoryPath ? { externalId, categoryPath } : null;
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
    select: { id: true, retailer: true, externalId: true, aisle: true },
  });
  const staleListings = listings.filter((listing) => needsAuthoritativeCategoryPathRestore(listing.aisle));
  const aldiPaths = new Map((await cachedProducts("/aldi/catalogue/products")).map((product) => [product.externalId, product.categoryPath]));
  const drakesStores = [...new Set(staleListings
    .filter((listing) => listing.retailer === "Drakes")
    .flatMap((listing) => {
      const storeId = drakesStoreId(listing.externalId);
      return storeId ? [storeId] : [];
    }))];
  const drakesPaths = new Map<string, string>();
  for (const storeId of drakesStores) {
    for (const product of await cachedProducts("/drakes/catalogue/products", { storeId })) {
      drakesPaths.set(`${storeId}:${product.externalId}`, product.categoryPath);
    }
  }

  const updates = staleListings.flatMap((listing) => {
    const categoryPath = listing.retailer === "ALDI"
      ? (listing.externalId ? aldiPaths.get(listing.externalId) : null)
      : (listing.externalId ? drakesPaths.get(listing.externalId) : null);
    return categoryPath && retailerPathDepartment(categoryPath)
      ? [{ id: listing.id, retailer: listing.retailer, categoryPath }]
      : [];
  });

  console.log(`${apply ? "Restoring" : "Would restore"} authoritative category paths for ${updates.length} of ${staleListings.length} ALDI/Drakes listings with missing or unrecognised paths.`);
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
