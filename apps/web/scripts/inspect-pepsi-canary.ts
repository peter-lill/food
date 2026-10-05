import "dotenv/config";

import { prisma } from "../src/lib/prisma";

const ids = [
  "d92b6eb5-baf6-46db-81f8-bb6fba3b80f8",
  "cmuvqi3y70000ovhea1tw75fl",
  "cmuvqi41l0001ovhesfhq98pm",
];

async function main() {
  const products = await prisma.product.findMany({
    where: { id: { in: ids } },
    select: {
      id: true, name: true, canonicalName: true, brand: true, barcode: true, packSize: true,
      storeProducts: {
        orderBy: [{ retailer: "asc" }, { retailerProductName: "asc" }],
        select: {
          id: true, productId: true, retailer: true, externalId: true, retailerProductName: true,
          brand: true, packSize: true, active: true,
          _count: { select: { priceObservations: true } },
        },
      },
      _count: {
        select: { aliases: true, shoppingItems: true, supermarketPrices: true, enrichmentJobs: true },
      },
    },
  });

  const observationOwnershipMismatches: Array<{
    observationId: string;
    observationProductId: string;
    storeProductId: string;
    storeProductProductId: string;
  }> = [];

  for (const product of products) {
    for (const storeProduct of product.storeProducts) {
      const mismatches = await prisma.priceObservation.findMany({
        where: {
          storeProductId: storeProduct.id,
          productId: { not: storeProduct.productId },
        },
        select: { id: true, productId: true, storeProductId: true },
      });
      observationOwnershipMismatches.push(...mismatches.map((x) => ({
        observationId: x.id,
        observationProductId: x.productId,
        storeProductId: x.storeProductId!,
        storeProductProductId: storeProduct.productId,
      })));
    }
  }

  console.log(JSON.stringify({
    products,
    observationOwnershipMismatchCount: observationOwnershipMismatches.length,
    observationOwnershipMismatches,
  }, null, 2));
}

main().finally(() => prisma.$disconnect());
