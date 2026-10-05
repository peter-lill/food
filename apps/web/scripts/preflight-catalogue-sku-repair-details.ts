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
      id: true, name: true, canonicalName: true, brand: true, barcode: true, packSize: true,
      aliases: { select: { id: true, alias: true, normalised: true, source: true } },
      inventoryItems: { select: { id: true } },
      ingredientRecords: { select: { id: true, name: true } },
      shoppingItems: { select: { id: true, name: true, quantity: true, unit: true, checked: true } },
      receiptItems: { select: { id: true, rawDescription: true } },
      supermarketPrices: { select: { id: true, retailer: true, productName: true, packSize: true, price: true } },
      enrichmentJobs: { select: { id: true, provider: true, status: true } },
      generatedContent: { select: { productId: true } },
      storeProducts: {
        where: { active: true },
        select: { id: true, retailer: true, externalId: true, retailerProductName: true, packSize: true },
      },
    },
  });

  const sensitive: Array<Record<string, unknown>> = [];
  let structurallyRepairable = 0;
  let aliasOnly = 0;
  let legacyPriceOnly = 0;
  let safeCatalogueMetadataOnly = 0;
  let userFacingDependencyProducts = 0;
  let otherOperationalDependencyProducts = 0;
  let shoppingItems = 0;
  let inventoryItems = 0;
  let ingredientRecords = 0;
  let receiptItems = 0;
  let legacyPrices = 0;
  let enrichmentJobs = 0;

  for (const product of products) {
    const { groups, unknown, contaminated } = groupListingsBySellablePack(product.storeProducts);
    if (!contaminated || unknown.length) continue;
    if (new Set(product.storeProducts.map((listing) => listing.retailer)).size !== 1) continue;
    const retained = productPack(product.packSize, product.name);
    if (!retained || !groups.has(retained)) continue;
    structurallyRepairable += 1;

    const userFacing = product.inventoryItems.length + product.ingredientRecords.length +
      product.shoppingItems.length + product.receiptItems.length;
    const operational = product.enrichmentJobs.length + (product.generatedContent ? 1 : 0);
    const catalogue = product.aliases.length + product.supermarketPrices.length;

    inventoryItems += product.inventoryItems.length;
    ingredientRecords += product.ingredientRecords.length;
    shoppingItems += product.shoppingItems.length;
    receiptItems += product.receiptItems.length;
    legacyPrices += product.supermarketPrices.length;
    enrichmentJobs += product.enrichmentJobs.length;

    if (userFacing > 0) userFacingDependencyProducts += 1;
    if (operational > 0) otherOperationalDependencyProducts += 1;
    if (userFacing === 0 && operational === 0) safeCatalogueMetadataOnly += 1;
    if (product.aliases.length > 0 && product.supermarketPrices.length === 0 && userFacing === 0 && operational === 0) aliasOnly += 1;
    if (product.supermarketPrices.length > 0 && userFacing === 0 && operational === 0) legacyPriceOnly += 1;

    if (userFacing > 0 || operational > 0 || product.supermarketPrices.length > 0) {
      sensitive.push({
        product: { id: product.id, name: product.name, packSize: product.packSize, barcode: product.barcode },
        counts: {
          aliases: product.aliases.length, inventoryItems: product.inventoryItems.length,
          ingredientRecords: product.ingredientRecords.length, shoppingItems: product.shoppingItems.length,
          receiptItems: product.receiptItems.length, supermarketPrices: product.supermarketPrices.length,
          enrichmentJobs: product.enrichmentJobs.length, generatedContent: product.generatedContent ? 1 : 0,
        },
        shoppingItems: product.shoppingItems,
        supermarketPrices: product.supermarketPrices,
        enrichmentJobs: product.enrichmentJobs,
      });
    }
  }

  console.log(JSON.stringify({
    mode: "dependency-preflight-detailed",
    writesPerformed: false,
    structurallyRepairable,
    classification: {
      safeCatalogueMetadataOnly,
      aliasOnly,
      legacyPriceOnly,
      userFacingDependencyProducts,
      otherOperationalDependencyProducts,
    },
    totals: { inventoryItems, ingredientRecords, shoppingItems, receiptItems, legacyPrices, enrichmentJobs },
    productsRequiringReview: sensitive,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
