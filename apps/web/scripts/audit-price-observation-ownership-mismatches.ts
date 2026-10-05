import "dotenv/config";

import { prisma } from "../src/lib/prisma";

const BATCH_SIZE = 1000;

async function main() {
  let cursor: string | undefined;
  const groups: Array<{
    storeProduct: {
      id: string;
      productId: string;
      retailer: string;
      externalId: string;
      retailerProductName: string;
      packSize: string | null;
      owner?: { name: string; packSize: string | null; barcode: string | null } | null;
    };
    mismatchCount: number;
    mismatchedProductIds: string[];
    observations: Array<{
      id: string;
      productId: string;
      observedAt: Date;
      createdAt: Date;
      product?: { name: string; packSize: string | null; barcode: string | null } | null;
    }>;
  }> = [];

  const neededProductIds = new Set<string>();

  while (true) {
    const storeProducts = await prisma.storeProduct.findMany({
      select: {
        id: true,
        productId: true,
        retailer: true,
        externalId: true,
        retailerProductName: true,
        packSize: true,
      },
      orderBy: { id: "asc" },
      take: BATCH_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (!storeProducts.length) break;

    const byId = new Map(storeProducts.map((storeProduct) => [storeProduct.id, storeProduct]));
    const observations = await prisma.priceObservation.findMany({
      where: { storeProductId: { in: storeProducts.map((storeProduct) => storeProduct.id) } },
      select: { id: true, productId: true, storeProductId: true, observedAt: true, createdAt: true },
    });

    const mismatchesByStoreProduct = new Map<string, typeof observations>();
    for (const observation of observations) {
      if (!observation.storeProductId) continue;
      const storeProduct = byId.get(observation.storeProductId);
      if (!storeProduct || observation.productId === storeProduct.productId) continue;
      const rows = mismatchesByStoreProduct.get(storeProduct.id) ?? [];
      rows.push(observation);
      mismatchesByStoreProduct.set(storeProduct.id, rows);
      neededProductIds.add(storeProduct.productId);
      neededProductIds.add(observation.productId);
    }

    for (const [storeProductId, mismatches] of mismatchesByStoreProduct) {
      const storeProduct = byId.get(storeProductId)!;
      groups.push({
        storeProduct: { ...storeProduct },
        mismatchCount: mismatches.length,
        mismatchedProductIds: [...new Set(mismatches.map((observation) => observation.productId))],
        observations: mismatches.map(({ storeProductId: _storeProductId, ...observation }) => observation),
      });
    }

    cursor = storeProducts.at(-1)!.id;
    if (storeProducts.length < BATCH_SIZE) break;
  }

  const products = await prisma.product.findMany({
    where: { id: { in: [...neededProductIds] } },
    select: { id: true, name: true, packSize: true, barcode: true },
  });
  const productById = new Map(products.map(({ id, ...product }) => [id, product]));

  for (const group of groups) {
    group.storeProduct.owner = productById.get(group.storeProduct.productId) ?? null;
    for (const observation of group.observations) {
      observation.product = productById.get(observation.productId) ?? null;
    }
  }

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
