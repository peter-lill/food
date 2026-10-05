import "dotenv/config";

import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import { comparablePackSize } from "../src/lib/products/retailer-product-identity";
import { groupListingsBySellablePack } from "../src/lib/products/catalogue-sku-contamination";

const APPLY_TOKEN = "I_UNDERSTAND_THIS_WRITES";
const argument = (name: string) => process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1);
const requestedProductId = argument("--product-id")?.trim();
const requestedName = argument("--name")?.trim();
const requestedLimit = Number(argument("--limit") ?? "50");
const limit = Number.isInteger(requestedLimit) && requestedLimit >= 1 && requestedLimit <= 500 ? requestedLimit : 50;
const scanAll = process.argv.includes("--all");
const summaryOnly = process.argv.includes("--summary");
const apply = process.argv.includes("--apply");
const confirmation = argument("--confirm");
const runId = randomUUID();

function packIdentity(packSize: string | null, name: string) {
  return comparablePackSize(packSize) ?? comparablePackSize(name);
}

function splitName(name: string, pack: string) {
  const normalisedNamePack = comparablePackSize(name);
  return normalisedNamePack === pack ? name : `${name} ${pack}`;
}

async function main() {
  if (apply && confirmation !== APPLY_TOKEN) {
    throw new Error(`Refusing writes. --apply requires --confirm=${APPLY_TOKEN}`);
  }
  if (apply && !requestedProductId && !scanAll) {
    throw new Error("Refusing broad writes without either --product-id=<id> or --all.");
  }

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
    description: true, imageUrl: true, packSize: true, packQuantity: true, packUnit: true,
    productType: true, lifecycle: true, confidenceScore: true,
    storeProducts: {
      where: { active: true },
      select: {
        id: true, retailer: true, externalId: true, retailerProductName: true, brand: true, packSize: true,
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

  const candidates: Array<{ product: ProductRow; retainedPack: string; groups: Map<string, ProductRow["storeProducts"]> }> = [];
  const skipped = { multiRetailer: 0, unknownPack: 0, ambiguousRetainedPack: 0, clean: 0 };
  for (const product of products) {
    const { groups, unknown, contaminated } = groupListingsBySellablePack(product.storeProducts);
    if (!contaminated) { skipped.clean += 1; continue; }
    if (new Set(product.storeProducts.map((x) => x.retailer)).size !== 1) { skipped.multiRetailer += 1; continue; }
    if (unknown.length) { skipped.unknownPack += 1; continue; }
    const retainedPack = packIdentity(product.packSize, product.name);
    if (!retainedPack || !groups.has(retainedPack)) { skipped.ambiguousRetainedPack += 1; continue; }
    candidates.push({ product, retainedPack, groups });
  }

  const results: Array<Record<string, unknown>> = [];
  let newProducts = 0;
  let storeProductMoves = 0;
  let observationMoves = 0;

  for (const candidate of candidates) {
    const { product, retainedPack, groups } = candidate;
    const plannedListingIds = [...groups.values()].flat().map((x) => x.id).sort();
    const plannedObservationCount = [...groups.entries()]
      .filter(([pack]) => pack !== retainedPack)
      .flatMap(([, listings]) => listings)
      .reduce((sum, listing) => sum + listing._count.priceObservations, 0);

    if (!apply) {
      const splitGroups = [...groups.entries()].filter(([pack]) => pack !== retainedPack);
      newProducts += splitGroups.length;
      storeProductMoves += splitGroups.reduce((sum, [, listings]) => sum + listings.length, 0);
      observationMoves += plannedObservationCount;
      results.push({ productId: product.id, status: "planned", retainedPack, splitPacks: splitGroups.map(([pack]) => pack) });
      continue;
    }

    const result = await prisma.$transaction(async (tx) => {
      // Re-read inside the transaction. Any importer drift invalidates this candidate.
      const live = await tx.product.findUnique({
        where: { id: product.id },
        select: {
          id: true, name: true, packSize: true, barcode: true,
          storeProducts: {
            where: { active: true },
            select: {
              id: true, retailer: true, retailerProductName: true, brand: true, packSize: true,
              _count: { select: { priceObservations: true } },
            },
          },
        },
      });
      if (!live) throw new Error(`Product ${product.id} disappeared before apply`);
      const liveGrouping = groupListingsBySellablePack(live.storeProducts);
      const liveListingIds = live.storeProducts.map((x) => x.id).sort();
      const liveRetainedPack = packIdentity(live.packSize, live.name);
      if (!liveGrouping.contaminated || liveGrouping.unknown.length || liveRetainedPack !== retainedPack ||
          JSON.stringify(liveListingIds) !== JSON.stringify(plannedListingIds)) {
        throw new Error(`Product ${product.id} changed since planning; refusing repair`);
      }

      const created: Array<{ id: string; pack: string }> = [];
      let movedListings = 0;
      let movedObservations = 0;

      for (const [pack, listings] of liveGrouping.groups) {
        if (pack === retainedPack) continue;

        // Split rows intentionally inherit descriptive catalogue fields only.
        // Barcode, aliases, user/domain relations, legacy SupermarketPrice and enrichment remain on parent.
        const representative = listings[0];
        const createdProduct = await tx.product.create({
          data: {
            name: splitName(product.name, pack),
            canonicalName: product.canonicalName ? splitName(product.canonicalName, pack) : null,
            brand: representative.brand ?? product.brand,
            barcode: null,
            category: product.category,
            description: product.description,
            imageUrl: product.imageUrl,
            packSize: representative.packSize ?? pack,
            productType: product.productType,
            lifecycle: product.lifecycle,
            confidenceScore: product.confidenceScore,
          },
          select: { id: true },
        });

        const listingIds = listings.map((x) => x.id);
        const observationsBefore = listings.reduce((sum, x) => sum + x._count.priceObservations, 0);

        const storeUpdate = await tx.storeProduct.updateMany({
          where: { id: { in: listingIds }, productId: product.id },
          data: { productId: createdProduct.id },
        });
        if (storeUpdate.count !== listingIds.length) {
          throw new Error(`StoreProduct move mismatch for ${product.id}/${pack}: expected ${listingIds.length}, got ${storeUpdate.count}`);
        }

        const observationUpdate = await tx.priceObservation.updateMany({
          where: { storeProductId: { in: listingIds }, productId: product.id },
          data: { productId: createdProduct.id },
        });
        if (observationUpdate.count !== observationsBefore) {
          throw new Error(`PriceObservation move mismatch for ${product.id}/${pack}: expected ${observationsBefore}, got ${observationUpdate.count}`);
        }

        const badObservations = await tx.priceObservation.count({
          where: { storeProductId: { in: listingIds }, NOT: { productId: createdProduct.id } },
        });
        if (badObservations !== 0) throw new Error(`Observation/Product mismatch remains for ${product.id}/${pack}`);

        const moved = await tx.storeProduct.findMany({
          where: { id: { in: listingIds } },
          select: { packSize: true, retailerProductName: true },
        });
        const movedPacks = new Set(moved.map((x) => packIdentity(x.packSize, x.retailerProductName)));
        if (movedPacks.size !== 1 || !movedPacks.has(pack)) {
          throw new Error(`Resulting Product ${createdProduct.id} does not have exactly one sellable pack ${pack}`);
        }

        created.push({ id: createdProduct.id, pack });
        movedListings += storeUpdate.count;
        movedObservations += observationUpdate.count;
      }

      const retainedListings = await tx.storeProduct.findMany({
        where: { productId: product.id, active: true },
        select: { packSize: true, retailerProductName: true },
      });
      const retainedPacks = new Set(retainedListings.map((x) => packIdentity(x.packSize, x.retailerProductName)));
      if (retainedPacks.size !== 1 || !retainedPacks.has(retainedPack)) {
        throw new Error(`Retained Product ${product.id} is not clean after repair`);
      }
      const retained = await tx.product.findUniqueOrThrow({
        where: { id: product.id },
        select: { barcode: true },
      });
      if (retained.barcode !== product.barcode) throw new Error(`Retained Product ${product.id} barcode changed`);

      return { productId: product.id, status: "applied", retainedPack, created, movedListings, movedObservations };
    }, { timeout: 60_000 });

    newProducts += result.created.length;
    storeProductMoves += result.movedListings;
    observationMoves += result.movedObservations;
    results.push(result);
  }

  console.log(JSON.stringify({
    mode: apply ? "apply" : "dry-run",
    writesPerformed: apply,
    runId,
    scannedProductCount: products.length,
    repairableProductCount: candidates.length,
    skipped,
    totals: { newProducts, storeProductMoves, priceObservationMoves: observationMoves },
    ...(summaryOnly ? {} : { results }),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
