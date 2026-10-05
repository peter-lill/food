import "dotenv/config";

import { prisma } from "../src/lib/prisma";
import { comparablePackSize } from "../src/lib/products/retailer-product-identity";
import { groupListingsBySellablePack } from "../src/lib/products/catalogue-sku-contamination";

function productPack(packSize: string | null, name: string) {
  return comparablePackSize(packSize) ?? comparablePackSize(name);
}

async function main() {
  const products = await prisma.product.findMany({
    where: { storeProducts: { some: { active: true } } },
    select: {
      id: true, name: true, packSize: true,
      _count: {
        select: {
          aliases: true, inventoryItems: true, ingredientRecords: true, shoppingItems: true,
          receiptItems: true, supermarketPrices: true, enrichmentJobs: true,
        },
      },
      generatedContent: { select: { productId: true } },
      storeProducts: {
        where: { active: true },
        select: { retailer: true, packSize: true, retailerProductName: true },
      },
    },
  });

  const dependencyTotals = {
    aliases: 0, inventoryItems: 0, ingredientRecords: 0, shoppingItems: 0,
    receiptItems: 0, supermarketPrices: 0, enrichmentJobs: 0, generatedContent: 0,
  };
  let structurallyRepairable = 0;
  let noExternalDependencies = 0;
  let withExternalDependencies = 0;
  const samples: Array<{ id: string; name: string; dependencies: Record<string, number> }> = [];

  for (const product of products) {
    const { groups, unknown, contaminated } = groupListingsBySellablePack(product.storeProducts);
    if (!contaminated || unknown.length) continue;
    if (new Set(product.storeProducts.map((listing) => listing.retailer)).size !== 1) continue;
    const retained = productPack(product.packSize, product.name);
    if (!retained || !groups.has(retained)) continue;
    structurallyRepairable += 1;

    const dependencies = {
      aliases: product._count.aliases,
      inventoryItems: product._count.inventoryItems,
      ingredientRecords: product._count.ingredientRecords,
      shoppingItems: product._count.shoppingItems,
      receiptItems: product._count.receiptItems,
      supermarketPrices: product._count.supermarketPrices,
      enrichmentJobs: product._count.enrichmentJobs,
      generatedContent: product.generatedContent ? 1 : 0,
    };
    const total = Object.values(dependencies).reduce((sum, value) => sum + value, 0);
    if (total === 0) {
      noExternalDependencies += 1;
      continue;
    }
    withExternalDependencies += 1;
    for (const [key, value] of Object.entries(dependencies)) {
      dependencyTotals[key as keyof typeof dependencyTotals] += value;
    }
    if (samples.length < 25) samples.push({ id: product.id, name: product.name, dependencies });
  }

  console.log(JSON.stringify({
    mode: "dependency-preflight",
    writesPerformed: false,
    structurallyRepairable,
    noExternalDependencies,
    withExternalDependencies,
    dependencyTotals,
    sampleProductsWithDependencies: samples,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
