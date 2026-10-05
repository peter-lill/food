import "dotenv/config";

import { prisma } from "../src/lib/prisma";

const BATCH_SIZE = 1000;

async function main() {
  let cursor: string | undefined;
  let checkedStoreProducts = 0;
  let checkedObservations = 0;
  let mismatchCount = 0;
  const mismatchSamples: Array<{
    observationId: string;
    observationProductId: string;
    storeProductId: string;
    storeProductProductId: string;
  }> = [];

  while (true) {
    const storeProducts = await prisma.storeProduct.findMany({
      select: { id: true, productId: true },
      orderBy: { id: "asc" },
      take: BATCH_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (!storeProducts.length) break;

    checkedStoreProducts += storeProducts.length;

    for (const storeProduct of storeProducts) {
      const observations = await prisma.priceObservation.findMany({
        where: { storeProductId: storeProduct.id },
        select: { id: true, productId: true },
      });
      checkedObservations += observations.length;

      for (const observation of observations) {
        if (observation.productId === storeProduct.productId) continue;
        mismatchCount += 1;
        if (mismatchSamples.length < 25) {
          mismatchSamples.push({
            observationId: observation.id,
            observationProductId: observation.productId,
            storeProductId: storeProduct.id,
            storeProductProductId: storeProduct.productId,
          });
        }
      }
    }

    cursor = storeProducts.at(-1)!.id;
    if (storeProducts.length < BATCH_SIZE) break;
  }

  console.log(JSON.stringify({
    checkedStoreProducts,
    checkedObservations,
    mismatchCount,
    mismatchSamples,
    passed: mismatchCount === 0,
  }, null, 2));

  if (mismatchCount !== 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
