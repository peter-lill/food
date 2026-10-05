import "dotenv/config";

import { prisma } from "../src/lib/prisma";
import { comparablePackSize } from "../src/lib/products/retailer-product-identity";

async function main() {
  const products: Array<{
    id: string; name: string; canonicalName: string | null; brand: string | null; packSize: string | null;
    lifecycle: string; storeProducts: Array<{
      id: string; retailer: string; externalId: string | null; retailerProductName: string;
      brand: string | null; packSize: string | null;
    }>;
  }> = [];
  const batchSize = 500;
  let cursor: string | undefined;
  while (true) {
    const batch = await prisma.product.findMany({
      where: { storeProducts: { some: { active: true } } },
      take: batchSize,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
      select: {
        id: true, name: true, canonicalName: true, brand: true, packSize: true, lifecycle: true,
        storeProducts: {
          where: { active: true },
          select: { id: true, retailer: true, externalId: true, retailerProductName: true, brand: true, packSize: true },
          orderBy: [{ retailer: "asc" }, { retailerProductName: "asc" }],
        },
      },
    });
    if (!batch.length) break;
    products.push(...batch);
    cursor = batch.at(-1)!.id;
    if (batch.length < batchSize) break;
  }

  const contaminated = products.flatMap((product) => {
    const groups = new Map<string, typeof product.storeProducts>();
    for (const listing of product.storeProducts) {
      const pack = comparablePackSize(listing.packSize) ?? comparablePackSize(listing.retailerProductName) ?? "unknown";
      const group = groups.get(pack) ?? [];
      group.push(listing);
      groups.set(pack, group);
    }
    const knownPacks = [...groups.keys()].filter((pack) => pack !== "unknown");
    if (knownPacks.length <= 1) return [];
    return [{
      product: {
        id: product.id, name: product.name, canonicalName: product.canonicalName,
        brand: product.brand, packSize: product.packSize, lifecycle: product.lifecycle,
      },
      packs: Object.fromEntries([...groups.entries()].map(([pack, listings]) => [
        pack,
        listings.map((listing) => ({
          id: listing.id, retailer: listing.retailer, externalId: listing.externalId,
          name: listing.retailerProductName, packSize: listing.packSize,
        })),
      ])),
    }];
  });

  console.log(JSON.stringify({ contaminatedProductCount: contaminated.length, products: contaminated }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
