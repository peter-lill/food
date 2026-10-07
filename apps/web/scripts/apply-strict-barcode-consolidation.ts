import "dotenv/config";
import { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import {
  loadFrozenManifest,
  validateManifestLiveState,
} from "./validate-strict-barcode-consolidation-manifest";

const CONFIRM = "I_UNDERSTAND_THIS_WRITES";

function hasFlag(name: string) {
  return process.argv.includes(name);
}
function valueFlag(prefix: string) {
  const arg = process.argv.find((x) => x.startsWith(prefix));
  return arg?.slice(prefix.length);
}

async function verifyPostconditions(
  tx: Prisma.TransactionClient,
  sourceId: string,
  targetId: string,
  storeProductIds: string[],
  expectedObservations: number,
) {
  const source = await tx.product.findUnique({
    where: { id: sourceId },
    select: { id: true },
  });
  if (source) throw new Error(`${sourceId}: source still exists after delete`);

  const movedListings = await tx.storeProduct.count({
    where: { id: { in: storeProductIds }, productId: targetId },
  });
  if (movedListings !== storeProductIds.length)
    throw new Error(`${sourceId}: StoreProduct postcondition failed`);

  const movedObservations = await tx.priceObservation.count({
    where: {
      productId: targetId,
      storeProductId: { in: storeProductIds },
    },
  });
  if (movedObservations < expectedObservations)
    throw new Error(`${sourceId}: PriceObservation postcondition failed`);
}

async function main() {
  const apply = hasFlag("--apply");
  const confirm = valueFlag("--confirm=");
  if (apply && confirm !== CONFIRM) {
    throw new Error(
      `Write mode requires --apply --confirm=${CONFIRM}`,
    );
  }

  const manifest = loadFrozenManifest();
  const preflight = await validateManifestLiveState(manifest);

  console.log("============================================================");
  console.log("STRICT BARCODE CONSOLIDATION");
  console.log("============================================================");
  console.log("Mode:", apply ? "APPLY" : "DRY-RUN");
  console.log("Decisions:", manifest.decisions.length);
  console.log("Preflight errors:", preflight.errors.length);

  if (preflight.errors.length) {
    console.dir(preflight.errors, { depth: null });
    throw new Error("Preflight failed; no writes performed");
  }

  if (!apply) {
    console.log("Would move StoreProducts:", manifest.totals.storeProducts);
    console.log(
      "Would move PriceObservations:",
      manifest.totals.priceObservations,
    );
    console.log("Would move aliases:", manifest.totals.aliases);
    console.log("Would move enrichment jobs:", manifest.totals.enrichmentJobs);
    console.log("Would delete source Products:", manifest.totals.decisions);
    console.log("Writes performed: false");
    return;
  }

  let completed = 0;
  let movedStoreProducts = 0;
  let movedPriceObservations = 0;
  let movedAliases = 0;
  let movedEnrichmentJobs = 0;

  for (const d of manifest.decisions) {
    const result = await prisma.$transaction(
      async (tx) => {
        // Lock both Products and all frozen StoreProducts. The validator has
        // already proved the frozen manifest matches the live state.
        await tx.$queryRawUnsafe(
          'SELECT id FROM "Product" WHERE id IN ($1,$2) FOR UPDATE',
          d.sourceProductId,
          d.targetProductId,
        );
        if (d.storeProductIds.length) {
          await tx.$queryRawUnsafe(
            'SELECT id FROM "StoreProduct" WHERE "productId" = $1 FOR UPDATE',
            d.sourceProductId,
          );
        }

        const source = await tx.product.findUnique({
          where: { id: d.sourceProductId },
          select: {
            id: true,
            barcode: true,
            foodKnowledgeId: true,
            generatedContent: { select: { productId: true } },
            _count: {
              select: {
                storeProducts: true,
                priceObservations: true,
                aliases: true,
                enrichmentJobs: true,
                inventoryItems: true,
                ingredientRecords: true,
                shoppingItems: true,
                receiptItems: true,
                supermarketPrices: true,
              },
            },
          },
        });
        const target = await tx.product.findUnique({
          where: { id: d.targetProductId },
          select: { id: true, barcode: true },
        });
        if (!source || !target)
          throw new Error(`${d.sourceProductId}: source/target disappeared`);
        if (source.barcode)
          throw new Error(`${d.sourceProductId}: source unexpectedly has barcode`);
        if (target.barcode !== d.targetBarcode)
          throw new Error(`${d.sourceProductId}: target barcode drift`);

        const prohibited =
          source._count.inventoryItems +
          source._count.ingredientRecords +
          source._count.shoppingItems +
          source._count.receiptItems +
          source._count.supermarketPrices +
          (source.generatedContent ? 1 : 0) +
          (source.foodKnowledgeId ? 1 : 0);
        if (prohibited)
          throw new Error(`${d.sourceProductId}: prohibited dependencies appeared`);

        if (
          source._count.storeProducts !== d.expected.storeProducts ||
          source._count.priceObservations !== d.expected.priceObservations ||
          source._count.aliases !== d.expected.aliases ||
          source._count.enrichmentJobs !== d.expected.enrichmentJobs
        )
          throw new Error(`${d.sourceProductId}: dependency count drift`);

        const listingIds = (
          await tx.storeProduct.findMany({
            where: { productId: d.sourceProductId },
            select: { id: true },
          })
        )
          .map((x) => x.id)
          .sort();
        if (
          listingIds.length !== d.storeProductIds.length ||
          listingIds.some((id, i) => id !== [...d.storeProductIds].sort()[i])
        )
          throw new Error(`${d.sourceProductId}: StoreProduct ID drift`);

        const ownedObservations = await tx.priceObservation.count({
          where: {
            productId: d.sourceProductId,
            storeProductId: { in: d.storeProductIds },
          },
        });
        if (ownedObservations !== d.expected.priceObservations)
          throw new Error(`${d.sourceProductId}: observation ownership drift`);

        const obs = await tx.priceObservation.updateMany({
          where: {
            productId: d.sourceProductId,
            storeProductId: { in: d.storeProductIds },
          },
          data: { productId: d.targetProductId },
        });
        const stores = await tx.storeProduct.updateMany({
          where: {
            id: { in: d.storeProductIds },
            productId: d.sourceProductId,
          },
          data: { productId: d.targetProductId },
        });
        const aliases = await tx.productAlias.updateMany({
          where: {
            id: { in: d.aliasIds },
            productId: d.sourceProductId,
          },
          data: { productId: d.targetProductId },
        });
        const jobs = await tx.productEnrichmentJob.updateMany({
          where: {
            id: { in: d.enrichmentJobIds },
            productId: d.sourceProductId,
          },
          data: { productId: d.targetProductId },
        });

        if (obs.count !== d.expected.priceObservations)
          throw new Error(`${d.sourceProductId}: observation move count mismatch`);
        if (stores.count !== d.expected.storeProducts)
          throw new Error(`${d.sourceProductId}: StoreProduct move count mismatch`);
        if (aliases.count !== d.expected.aliases)
          throw new Error(`${d.sourceProductId}: alias move count mismatch`);
        if (jobs.count !== d.expected.enrichmentJobs)
          throw new Error(`${d.sourceProductId}: enrichment-job move count mismatch`);

        const remaining = await tx.product.findUnique({
          where: { id: d.sourceProductId },
          select: {
            _count: {
              select: {
                storeProducts: true,
                priceObservations: true,
                aliases: true,
                enrichmentJobs: true,
                inventoryItems: true,
                ingredientRecords: true,
                shoppingItems: true,
                receiptItems: true,
                supermarketPrices: true,
              },
            },
            generatedContent: { select: { productId: true } },
            foodKnowledgeId: true,
          },
        });
        if (!remaining) throw new Error(`${d.sourceProductId}: source vanished early`);
        const rc = remaining._count;
        if (
          rc.storeProducts ||
          rc.priceObservations ||
          rc.aliases ||
          rc.enrichmentJobs ||
          rc.inventoryItems ||
          rc.ingredientRecords ||
          rc.shoppingItems ||
          rc.receiptItems ||
          rc.supermarketPrices ||
          remaining.generatedContent ||
          remaining.foodKnowledgeId
        )
          throw new Error(`${d.sourceProductId}: source still owns dependencies`);

        await tx.product.delete({ where: { id: d.sourceProductId } });
        await verifyPostconditions(
          tx,
          d.sourceProductId,
          d.targetProductId,
          d.storeProductIds,
          d.expected.priceObservations,
        );

        return {
          stores: stores.count,
          observations: obs.count,
          aliases: aliases.count,
          jobs: jobs.count,
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5_000,
        timeout: 60_000,
      },
    );

    completed++;
    movedStoreProducts += result.stores;
    movedPriceObservations += result.observations;
    movedAliases += result.aliases;
    movedEnrichmentJobs += result.jobs;

    if (completed % 100 === 0)
      console.log(`Completed ${completed}/${manifest.decisions.length}`);
  }

  console.log("============================================================");
  console.log("APPLY COMPLETE");
  console.log("Completed Products:", completed);
  console.log("StoreProducts moved:", movedStoreProducts);
  console.log("PriceObservations moved:", movedPriceObservations);
  console.log("Aliases moved:", movedAliases);
  console.log("EnrichmentJobs moved:", movedEnrichmentJobs);
  console.log("Writes performed: true");
  console.log(
    "IMPORTANT: apply is intentionally non-rerunnable; validate the resulting database now.",
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
