import "dotenv/config";

import { prisma } from "../src/lib/prisma";

const IDS = [
  "1b802c73-b50c-40ed-8811-0aa45d07d115",
  "55afeb81-b2cb-465a-bacd-9ef24c503f86",
  "742d8c2b-ddde-45d6-9aff-71165e117853",
];

async function main() {
  const products = await prisma.product.findMany({
    where: { id: { in: IDS } },
    select: {
      id: true,
      name: true,
      canonicalName: true,
      brand: true,
      barcode: true,
      packSize: true,
      lifecycle: true,
      confidenceScore: true,
      createdAt: true,
      updatedAt: true,
      storeProducts: {
        select: {
          id: true,
          retailer: true,
          externalId: true,
          retailerProductName: true,
          brand: true,
          packSize: true,
          active: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { priceObservations: true } },
        },
      },
      _count: {
        select: {
          aliases: true,
          inventoryItems: true,
          shoppingItems: true,
          receiptItems: true,
          supermarketPrices: true,
          priceObservations: true,
          enrichmentJobs: true,
        },
      },
    },
  });

  console.log(JSON.stringify({ mode: "read-only", products }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
