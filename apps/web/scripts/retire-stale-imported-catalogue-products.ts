import "dotenv/config";

import { prisma } from "../src/lib/prisma";
import { currentRetailerCatalogueIndex, staleRetailerListingIds } from "./imported-catalogue-path-recovery";

const apply = process.argv.includes("--apply");
const pageSize = 500;
const requestedDrakesStore = process.argv.find((argument) => argument.startsWith("--drakes-store="))?.slice("--drakes-store=".length).toLowerCase() ?? null;
if (requestedDrakesStore && !/^[a-z0-9-]{1,64}$/.test(requestedDrakesStore)) throw new Error("--drakes-store must be a Drakes store ID, for example 089.");

type CachedResponse = { status?: unknown; products?: unknown; nextOffset?: unknown; error?: unknown };
type CachedProduct = { externalId: string; name: string; productUrl: string | null };

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function cachedProduct(value: unknown): CachedProduct | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const externalId = text(input.external_id);
  const name = text(input.name);
  return externalId && name ? { externalId, name, productUrl: text(input.product_url) } : null;
}

async function cachedProducts(pathname: string, query: Record<string, string> = {}) {
  const bridgeUrl = process.env.GROCERY_MCP_BRIDGE_URL?.trim();
  if (!bridgeUrl) throw new Error("GROCERY_MCP_BRIDGE_URL is required to compare against the current retailer catalogues.");

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
  if (!requestedDrakesStore) throw new Error("--drakes-store is required so Drakes listings are compared with the selected current store, for example --drakes-store=089.");

  const [aldiProducts, drakesProducts] = await Promise.all([
    cachedProducts("/aldi/catalogue/products"),
    cachedProducts("/drakes/catalogue/products", { storeId: requestedDrakesStore }),
  ]);
  const current = {
    ALDI: currentRetailerCatalogueIndex(aldiProducts, "ALDI"),
    Drakes: currentRetailerCatalogueIndex(drakesProducts, "Drakes", requestedDrakesStore),
  };
  const retailerListings = await prisma.storeProduct.findMany({
    where: {
      active: true,
      retailer: { in: ["ALDI", "Drakes"] },
      product: { lifecycle: { not: "ARCHIVED" } },
    },
    select: { id: true, productId: true, retailer: true, externalId: true, retailerProductName: true, productUrl: true },
  });
  const staleListingIds = staleRetailerListingIds(retailerListings, current);
  const staleListingIdSet = new Set(staleListingIds);
  const affectedProductIds = [...new Set(retailerListings.filter((listing) => staleListingIdSet.has(listing.id)).map((listing) => listing.productId))];
  const affectedProducts = affectedProductIds.length ? await prisma.product.findMany({
    where: { id: { in: affectedProductIds }, lifecycle: { not: "ARCHIVED" } },
    select: {
      id: true,
      name: true,
      storeProducts: { where: { active: true }, select: { id: true } },
      _count: { select: { inventoryItems: true, ingredientRecords: true, shoppingItems: true, receiptItems: true } },
    },
  }) : [];
  const protectedProducts = affectedProducts.filter((product) => Object.values(product._count).some((count) => count > 0));
  const staleProducts = affectedProducts.filter((product) => {
    if (Object.values(product._count).some((count) => count > 0)) return false;
    return product.storeProducts.every((listing) => staleListingIdSet.has(listing.id));
  });
  const retailerCounts = Object.fromEntries(["ALDI", "Drakes"].map((retailer) => [retailer, retailerListings.filter((listing) => listing.retailer === retailer && staleListingIdSet.has(listing.id)).length]));

  console.log(`${apply ? "Deactivating" : "Would deactivate"} ${staleListingIds.length} stale ALDI/Drakes retailer listings.`);
  console.log(`${apply ? "Archiving" : "Would archive"} ${staleProducts.length} products left with no current retailer listing or user history.`);
  console.log(`Current cache coverage: ALDI ${aldiProducts.length} listings; Drakes ${drakesProducts.length} listings at store ${requestedDrakesStore}.`);
  console.log(`Protected from archival because they have pantry, recipe, shopping, or receipt history: ${protectedProducts.length}.`);
  console.log(`Stale listings by retailer: ${JSON.stringify(retailerCounts)}.`);
  for (const product of staleProducts.slice(0, 20)) console.log(`- ${product.name} (${product.id})`);
  if (staleProducts.length > 20) console.log(`…and ${staleProducts.length - 20} more.`);
  if (!apply) {
    console.log("No database changes were made. Rerun with --apply after reviewing this preview.");
    return;
  }
  if (!staleListingIds.length) {
    console.log("No stale retailer listings or catalogue-only products required retirement.");
    return;
  }
  const [listingResult, productResult] = await prisma.$transaction(async (transaction) => {
    const retiredListings = await transaction.storeProduct.updateMany({ where: { id: { in: staleListingIds }, active: true }, data: { active: false } });
    const archivedProducts = await transaction.product.updateMany({ where: { id: { in: staleProducts.map((product) => product.id) }, lifecycle: { not: "ARCHIVED" } }, data: { lifecycle: "ARCHIVED" } });
    if (retiredListings.count !== staleListingIds.length || archivedProducts.count !== staleProducts.length) {
      throw new Error(`Retired ${retiredListings.count}/${staleListingIds.length} listings and ${archivedProducts.count}/${staleProducts.length} products; expected an exact atomic update.`);
    }
    return [retiredListings, archivedProducts] as const;
  });
  console.log(`Deactivated ${listingResult.count} stale retailer listings and archived ${productResult.count} catalogue-only products. Price and user history were retained.`);
}

void main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
