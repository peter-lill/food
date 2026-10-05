import "dotenv/config";

import { prisma } from "../src/lib/prisma";
import { comparablePackSize } from "../src/lib/products/retailer-product-identity";

const argument = (name: string) => process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1);
const requestedProductId = argument("--product-id")?.trim();
const requestedName = argument("--name")?.trim();
const requestedLimit = Number(argument("--limit") ?? "50");
const limit = Number.isInteger(requestedLimit) && requestedLimit >= 1 && requestedLimit <= 500 ? requestedLimit : 50;

function packIdentity(packSize: string | null, name: string) {
  return comparablePackSize(packSize) ?? comparablePackSize(name);
}

async function main() {
  const products = await prisma.product.findMany({
    where: {
      storeProducts: { some: { active: true } },
      ...(requestedProductId ? { id: requestedProductId } : {}),
      ...(requestedName ? {
        OR: [
          { name: { contains: requestedName, mode: "insensitive" } },
          { canonicalName: { contains: requestedName, mode: "insensitive" } },
        ],
      } : {}),
    },
    take: requestedProductId ? 1 : limit,
    orderBy: [{ name: "asc" }, { id: "asc" }],
    select: {
      id: true, name: true, canonicalName: true, brand: true, barcode: true, category: true,
      packSize: true, productType: true, lifecycle: true, confidenceScore: true,
      storeProducts: {
        where: { active: true },
        select: {
          id: true, retailer: true, externalId: true, retailerProductName: true,
          brand: true, packSize: true,
          _count: { select: { priceObservations: true } },
        },
        orderBy: [{ retailer: "asc" }, { retailerProductName: "asc" }],
      },
    },
  });

  const plans = [];
  let skippedMultiRetailer = 0;
  let skippedUnknownPack = 0;
  let skippedClean = 0;

  for (const product of products) {
    const retailers = [...new Set(product.storeProducts.map((listing) => listing.retailer))];
    if (retailers.length !== 1) {
      skippedMultiRetailer += 1;
      continue;
    }

    const groups = new Map<string, typeof product.storeProducts>();
    let unknown = false;
    for (const listing of product.storeProducts) {
      const pack = packIdentity(listing.packSize, listing.retailerProductName);
      if (!pack) { unknown = true; break; }
      const group = groups.get(pack) ?? [];
      group.push(listing);
      groups.set(pack, group);
    }
    if (unknown) {
      skippedUnknownPack += 1;
      continue;
    }
    if (groups.size <= 1) {
      skippedClean += 1;
      continue;
    }

    const productPack = packIdentity(product.packSize, product.name);
    const retainedPack = productPack && groups.has(productPack)
      ? productPack
      : [...groups.entries()].sort((a, b) => {
          const aPrices = a[1].reduce((sum, listing) => sum + listing._count.priceObservations, 0);
          const bPrices = b[1].reduce((sum, listing) => sum + listing._count.priceObservations, 0);
          return bPrices - aPrices || a[0].localeCompare(b[0]);
        })[0][0];

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
    filters: { productId: requestedProductId ?? null, name: requestedName ?? null, limit },
    scannedProductCount: products.length,
    repairableProductCount: plans.length,
    skipped: { multiRetailer: skippedMultiRetailer, unknownPack: skippedUnknownPack, clean: skippedClean },
    plans,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
