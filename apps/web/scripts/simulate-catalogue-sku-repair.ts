import "dotenv/config";

import type { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import { comparablePackSize } from "../src/lib/products/retailer-product-identity";
import { groupListingsBySellablePack } from "../src/lib/products/catalogue-sku-contamination";

const argument = (name: string) => process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1);
const requestedProductId = argument("--product-id")?.trim();
const requestedName = argument("--name")?.trim();
const scanAll = process.argv.includes("--all");
const summaryOnly = process.argv.includes("--summary");

function packIdentity(packSize: string | null, name: string) {
  return comparablePackSize(packSize) ?? comparablePackSize(name);
}

type Failure = { productId: string; productName: string; invariant: string; detail: string };

async function main() {
  const where = {
    storeProducts: { some: { active: true } },
    ...(requestedProductId ? { id: requestedProductId } : {}),
    ...(requestedName ? {
      OR: [
        { name: { contains: requestedName, mode: "insensitive" as const } },
        { canonicalName: { contains: requestedName, mode: "insensitive" as const } },
      ],
    } : {}),
  };

  const select = {
    id: true,
    name: true,
    packSize: true,
    barcode: true,
    aliases: { select: { id: true } },
    inventoryItems: { select: { id: true } },
    ingredientRecords: { select: { id: true } },
    shoppingItems: { select: { id: true } },
    receiptItems: { select: { id: true } },
    supermarketPrices: { select: { id: true } },
    enrichmentJobs: { select: { id: true } },
    generatedContent: { select: { productId: true } },
    storeProducts: {
      where: { active: true },
      select: {
        id: true,
        retailer: true,
        externalId: true,
        retailerProductName: true,
        packSize: true,
        priceObservations: { select: { id: true, productId: true, storeProductId: true } },
      },
    },
  };

  type ProductRow = Prisma.ProductGetPayload<{ select: typeof select }>;
  const products: ProductRow[] = [];
  let cursor: string | undefined;
  while (true) {
    const batch = await prisma.product.findMany({
      where,
      select,
      take: scanAll && !requestedProductId && !requestedName ? 500 : 100,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
    });
    products.push(...batch);
    if (!scanAll || requestedProductId || requestedName || batch.length < 500) break;
    cursor = batch.at(-1)!.id;
  }

  const failures: Failure[] = [];
  let repairableProductCount = 0;
  let simulatedNewProducts = 0;
  let simulatedStoreProductMoves = 0;
  let simulatedObservationMoves = 0;
  let skippedMultiRetailer = 0;
  let skippedUnknownPack = 0;
  let skippedAmbiguousRetainedPack = 0;
  let skippedClean = 0;

  for (const product of products) {
    const { groups, unknown, contaminated } = groupListingsBySellablePack(product.storeProducts);
    if (!contaminated) {
      skippedClean += 1;
      continue;
    }

    const retailers = [...new Set(product.storeProducts.map((listing) => listing.retailer))];
    if (retailers.length !== 1) {
      skippedMultiRetailer += 1;
      continue;
    }
    if (unknown.length) {
      skippedUnknownPack += 1;
      continue;
    }

    const retainedPack = packIdentity(product.packSize, product.name);
    if (!retainedPack || !groups.has(retainedPack)) {
      skippedAmbiguousRetainedPack += 1;
      continue;
    }

    repairableProductCount += 1;
    const originalBarcode = product.barcode;
    const retainedRelations = {
      aliases: product.aliases.length,
      inventoryItems: product.inventoryItems.length,
      ingredientRecords: product.ingredientRecords.length,
      shoppingItems: product.shoppingItems.length,
      receiptItems: product.receiptItems.length,
      supermarketPrices: product.supermarketPrices.length,
      enrichmentJobs: product.enrichmentJobs.length,
      generatedContent: product.generatedContent ? 1 : 0,
    };

    for (const [pack, listings] of groups) {
      const resultingProduct = pack === retainedPack
        ? { id: product.id, pack, barcode: originalBarcode, retainedRelations }
        : {
            id: `SIMULATED:${product.id}:${pack}`,
            pack,
            barcode: null,
            retainedRelations: {
              aliases: 0, inventoryItems: 0, ingredientRecords: 0, shoppingItems: 0,
              receiptItems: 0, supermarketPrices: 0, enrichmentJobs: 0, generatedContent: 0,
            },
          };

      if (pack !== retainedPack) simulatedNewProducts += 1;

      const resultingPacks = new Set<string>();
      for (const listing of listings) {
        const listingPack = packIdentity(listing.packSize, listing.retailerProductName);
        if (!listingPack) {
          failures.push({ productId: product.id, productName: product.name, invariant: "known-pack", detail: `Listing ${listing.id} lost pack identity` });
          continue;
        }
        resultingPacks.add(listingPack);

        if (pack !== retainedPack) simulatedStoreProductMoves += 1;
        for (const observation of listing.priceObservations) {
          const simulatedObservationProductId = resultingProduct.id;
          if (simulatedObservationProductId !== resultingProduct.id) {
            failures.push({ productId: product.id, productName: product.name, invariant: "observation-product", detail: `Observation ${observation.id} would not follow StoreProduct ${listing.id}` });
          }
          if (observation.storeProductId !== listing.id) {
            failures.push({ productId: product.id, productName: product.name, invariant: "observation-store-product", detail: `Observation ${observation.id} references ${observation.storeProductId ?? "null"}, expected ${listing.id}` });
          }
          if (pack !== retainedPack) simulatedObservationMoves += 1;
        }
      }

      if (resultingPacks.size !== 1 || !resultingPacks.has(pack)) {
        failures.push({
          productId: product.id,
          productName: product.name,
          invariant: "single-sellable-pack",
          detail: `Result ${resultingProduct.id} expected only ${pack}, saw ${[...resultingPacks].join(", ") || "none"}`,
        });
      }

      if (pack === retainedPack && resultingProduct.barcode !== originalBarcode) {
        failures.push({ productId: product.id, productName: product.name, invariant: "retained-barcode", detail: "Existing Product barcode would change" });
      }
      if (pack !== retainedPack && resultingProduct.barcode !== null) {
        failures.push({ productId: product.id, productName: product.name, invariant: "split-barcode", detail: `Split Product ${resultingProduct.id} inherited a barcode` });
      }
      if (pack !== retainedPack && Object.values(resultingProduct.retainedRelations).some((count) => count !== 0)) {
        failures.push({ productId: product.id, productName: product.name, invariant: "non-sku-relations", detail: `Split Product ${resultingProduct.id} inherited parent-only relations` });
      }
    }
  }

  const output = {
    mode: "simulation",
    writesPerformed: false,
    scannedProductCount: products.length,
    repairableProductCount,
    skipped: {
      multiRetailer: skippedMultiRetailer,
      unknownPack: skippedUnknownPack,
      ambiguousRetainedPack: skippedAmbiguousRetainedPack,
      clean: skippedClean,
    },
    simulated: {
      newProducts: simulatedNewProducts,
      storeProductMoves: simulatedStoreProductMoves,
      priceObservationMoves: simulatedObservationMoves,
    },
    invariants: {
      passed: failures.length === 0,
      failureCount: failures.length,
    },
    ...(summaryOnly ? { failures: failures.slice(0, 20) } : { failures }),
  };

  console.log(JSON.stringify(output, null, 2));
  if (failures.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
