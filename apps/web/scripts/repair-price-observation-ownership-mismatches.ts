import "dotenv/config";

import { prisma } from "../src/lib/prisma";

const CONFIRM = "I_UNDERSTAND_THIS_WRITES";
const MANUAL_REVIEW_STORE_PRODUCT_IDS = new Set([
  "7de8781b-d56e-4464-b27b-4f57ad0d7265",
]);

const apply = process.argv.includes("--apply");
const confirm = process.argv.find((arg) => arg.startsWith("--confirm="))?.slice("--confirm=".length);

async function main() {
  if (apply && confirm !== CONFIRM) {
    throw new Error(`Writes require --apply --confirm=${CONFIRM}`);
  }

  const storeProducts = await prisma.storeProduct.findMany({
    select: { id: true, productId: true, retailer: true, externalId: true, retailerProductName: true },
  });
  const storeProductById = new Map(storeProducts.map((row) => [row.id, row]));

  const observations = await prisma.priceObservation.findMany({
    where: { storeProductId: { not: null } },
    select: { id: true, productId: true, storeProductId: true },
  });

  const targets = observations.flatMap((observation) => {
    if (!observation.storeProductId) return [];
    const storeProduct = storeProductById.get(observation.storeProductId);
    if (!storeProduct || observation.productId === storeProduct.productId) return [];
    if (MANUAL_REVIEW_STORE_PRODUCT_IDS.has(storeProduct.id)) return [];
    return [{ observation, storeProduct }];
  });

  const manualReview = observations.filter((observation) => {
    if (!observation.storeProductId) return false;
    const storeProduct = storeProductById.get(observation.storeProductId);
    return Boolean(
      storeProduct &&
      observation.productId !== storeProduct.productId &&
      MANUAL_REVIEW_STORE_PRODUCT_IDS.has(storeProduct.id),
    );
  });

  const summary = {
    mode: apply ? "apply" : "dry-run",
    writesPerformed: false,
    automaticObservationRepairs: targets.length,
    automaticStoreProducts: new Set(targets.map(({ storeProduct }) => storeProduct.id)).size,
    manualReviewObservations: manualReview.length,
    manualReviewStoreProducts: new Set(manualReview.map((row) => row.storeProductId)).size,
  };

  if (!apply) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  await prisma.$transaction(async (tx) => {
    for (const { observation, storeProduct } of targets) {
      const result = await tx.priceObservation.updateMany({
        where: {
          id: observation.id,
          productId: observation.productId,
          storeProductId: storeProduct.id,
        },
        data: { productId: storeProduct.productId },
      });
      if (result.count !== 1) {
        throw new Error(`Drift detected while repairing observation ${observation.id}`);
      }
    }

    const repairedIds = targets.map(({ observation }) => observation.id);
    const repaired = repairedIds.length
      ? await tx.priceObservation.findMany({
          where: { id: { in: repairedIds } },
          select: { id: true, productId: true, storeProductId: true },
        })
      : [];

    for (const observation of repaired) {
      if (!observation.storeProductId) throw new Error(`Observation ${observation.id} lost StoreProduct ownership`);
      const storeProduct = storeProductById.get(observation.storeProductId);
      if (!storeProduct || observation.productId !== storeProduct.productId) {
        throw new Error(`Post-repair ownership verification failed for ${observation.id}`);
      }
    }
  }, { timeout: 60_000 });

  console.log(JSON.stringify({ ...summary, writesPerformed: true }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
