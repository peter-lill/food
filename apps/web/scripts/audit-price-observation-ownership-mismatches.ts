import "dotenv/config";

import { prisma } from "../src/lib/prisma";

async function main() {
  const storeProducts = await prisma.storeProduct.findMany({
    select: {
      id: true,
      productId: true,
      retailer: true,
      externalId: true,
      retailerProductName: true,
      packSize: true,
      product: { select: { name: true, packSize: true, barcode: true } },
      priceObservations: {
        select: {
          id: true,
          productId: true,
          observedAt: true,
          createdAt: true,
          product: { select: { name: true, packSize: true, barcode: true } },
        },
      },
    },
  });

  const groups = storeProducts.flatMap((storeProduct) => {
    const mismatches = storeProduct.priceObservations.filter(
      (observation) => observation.productId !== storeProduct.productId,
    );
    if (!mismatches.length) return [];

    const mismatchedProductIds = [...new Set(mismatches.map((observation) => observation.productId))];

    return [{
      storeProduct: {
        id: storeProduct.id,
        productId: storeProduct.productId,
        retailer: storeProduct.retailer,
        externalId: storeProduct.externalId,
        retailerProductName: storeProduct.retailerProductName,
        packSize: storeProduct.packSize,
        owner: storeProduct.product,
      },
      mismatchCount: mismatches.length,
      mismatchedProductIds,
      observations: mismatches,
    }];
  });

  console.log(JSON.stringify({
    mode: "read-only",
    storeProductsWithMismatches: groups.length,
    mismatchCount: groups.reduce((sum, group) => sum + group.mismatchCount, 0),
    groups,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
