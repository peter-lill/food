import "dotenv/config";

import { existsSync, readFileSync } from "node:fs";
import { prisma } from "../src/lib/prisma";

const argument = (name: string) => process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1);
const manifestPath = argument("--manifest")?.trim();

function manifestProductIds() {
  const ids = new Set<string>();
  if (!manifestPath) return ids;
  if (!existsSync(manifestPath)) throw new Error(`Manifest does not exist: ${manifestPath}`);
  for (const line of readFileSync(manifestPath, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    const row = JSON.parse(line) as { type?: string; status?: string; productId?: string; created?: Array<{ id?: string }> };
    if (row.type !== "product" || row.status !== "applied" || !row.productId) continue;
    ids.add(row.productId);
    for (const created of row.created ?? []) if (created.id) ids.add(created.id);
  }
  return ids;
}

const BATCH_SIZE = 1000;

async function main() {
  let cursor: string | undefined;
  let checkedStoreProducts = 0;
  let checkedObservations = 0;
  const repairedProductIds = manifestProductIds();
  let mismatchCount = 0;
  let migrationRelatedMismatchCount = 0;
  let historicalMismatchCount = 0;
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
        const migrationRelated = repairedProductIds.has(observation.productId) || repairedProductIds.has(storeProduct.productId);
        if (migrationRelated) migrationRelatedMismatchCount += 1;
        else historicalMismatchCount += 1;
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
    manifestPath: manifestPath ?? null,
    manifestProductCount: repairedProductIds.size,
    migrationRelatedMismatchCount,
    historicalMismatchCount,
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
