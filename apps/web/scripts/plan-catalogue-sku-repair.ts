import "dotenv/config";

import type { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import { comparablePackSize } from "../src/lib/products/retailer-product-identity";

const argument = (name: string) => process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1);
const requestedProductId = argument("--product-id")?.trim();
const requestedName = argument("--name")?.trim();
const requestedLimit = Number(argument("--limit") ?? "50");
const limit = Number.isInteger(requestedLimit) && requestedLimit >= 1 && requestedLimit <= 500 ? requestedLimit : 50;
const scanAll = process.argv.includes("--all");
const summaryOnly = process.argv.includes("--summary");

function packIdentity(packSize: string | null, name: string) {
  return comparablePackSize(packSize) ?? comparablePackSize(name);
}

async function main() {
  const productWhere = {
    storeProducts: { some: { active: true } },
    ...(requestedProductId ? { id: requestedProductId } : {}),
    ...(requestedName ? {
      OR: [
        { name: { contains: requestedName, mode: "insensitive" as const } },
        { canonicalName: { contains: requestedName, mode: "insensitive" as const } },
      ],
    } : {}),
  };
  const productSelect = {
    id: true, name: true, canonicalName: true, brand: true, barcode: true, category: true,
    packSize: true, productType: true, lifecycle: true, confidenceScore: true,
    storeProducts: {
      where: { active: true },
      select: {
        id: true, retailer: true, externalId: true, retailerProductName: true,
        brand: true, packSize: true,
        _count: { select: { priceObservations: true } },
      },
      orderBy: [{ retailer: "asc" as const }, { retailerProductName: "asc" as const }],
    },
  };
  type ProductRow = Prisma.ProductGetPayload<{ select: typeof productSelect }>;
  const products: ProductRow[] = [];
  if (scanAll && !requestedProductId && !requestedName) {
    let cursor: string | undefined;
    while (true) {
      const batch = await prisma.product.findMany({
        where: productWhere, select: productSelect, take: 500,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        orderBy: { id: "asc" },
      });
      if (!batch.length) break;
      products.push(...batch);
      cursor = batch.at(-1)!.id;
      if (batch.length < 500) break;
    }
  } else {
    products.push(...await prisma.product.findMany({
      where: productWhere, select: productSelect,
      take: requestedProductId ? 1 : limit,
      orderBy: [{ name: "asc" }, { id: "asc" }],
    }));
  }

  const plans = [];
  let skippedMultiRetailer = 0;
  let skippedUnknownPack = 0;
  let skippedClean = 0;
  let skippedAmbiguousRetainedPack = 0;

  for (const product of products) {
    const groups = new Map<string, typeof product.storeProducts>();
    let hasUnknown = false;
    for (const listing of product.storeProducts) {
      const pack = packIdentity(listing.packSize, listing.retailerProductName);
      if (!pack) {
        hasUnknown = true;
        continue;
      }
      const group = groups.get(pack) ?? [];
      group.push(listing);
      groups.set(pack, group);
    }

    // A Product is only contaminated when its active listings expose more than one known sellable pack.
    if (groups.size <= 1) {
      skippedClean += 1;
      continue;
    }

    const retailers = [...new Set(product.storeProducts.map((listing) => listing.retailer))];
    if (retailers.length !== 1) {
      skippedMultiRetailer += 1;
      continue;
    }
    if (hasUnknown) {
      skippedUnknownPack += 1;
      continue;
    }

    const productPack = packIdentity(product.packSize, product.name);
    if (!productPack || !groups.has(productPack)) {
      skippedAmbiguousRetainedPack += 1;
      continue;
    }
    const retainedPack = productPack;

    plans.push({
      product: {
        id: product.id, name: product.name, canonicalName: product.canonicalName, brand: product.brand,
        barcode: product.barcode, packSize: product.packSize, lifecycle: product.lifecycle,
      },
      retailer: retailers[0],
      retainedPack,
      groups: [...groups.entries()].map(([pack, listings]) => ({
        pack,
        action: pack === retainedPack ? "retain-on-existing-product" : "create-new-product-and-move",
        storeProductCount: listings.length,
        priceObservationCount: listings.reduce((sum, listing) => sum + listing._count.priceObservations, 0),
        listings: listings.map((listing) => ({
          id: listing.id, externalId: listing.externalId, name: listing.retailerProductName,
          packSize: listing.packSize, priceObservationCount: listing._count.priceObservations,
        })),
      })),
    });
  }

  console.log(JSON.stringify({
    mode: "dry-run",
    writesPerformed: false,
    filters: { productId: requestedProductId ?? null, name: requestedName ?? null, limit, all: scanAll },
    scannedProductCount: products.length,
    repairableProductCount: plans.length,
    skipped: {
      multiRetailer: skippedMultiRetailer,
      unknownPack: skippedUnknownPack,
      ambiguousRetainedPack: skippedAmbiguousRetainedPack,
      clean: skippedClean,
    },
    totals: {
      newProductsRequired: plans.reduce((sum, plan) => sum + plan.groups.filter((group) => group.action === "create-new-product-and-move").length, 0),
      storeProductsToMove: plans.reduce((sum, plan) => sum + plan.groups.filter((group) => group.action === "create-new-product-and-move").reduce((groupSum, group) => groupSum + group.storeProductCount, 0), 0),
      priceObservationsToMove: plans.reduce((sum, plan) => sum + plan.groups.filter((group) => group.action === "create-new-product-and-move").reduce((groupSum, group) => groupSum + group.priceObservationCount, 0), 0),
    },
    ...(summaryOnly ? {} : { plans }),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
