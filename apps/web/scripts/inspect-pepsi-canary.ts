import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const ids = [
  "d92b6eb5-baf6-46db-81f8-bb6fba3b80f8",
  "cmuvqi3y70000ovhea1tw75fl",
  "cmuvqi41l0001ovhesfhq98pm",
];

async function main() {
  const products = await prisma.product.findMany({
    where: { id: { in: ids } },
    select: {
      id: true, name: true, canonicalName: true, brand: true, barcode: true, packSize: true,
      storeProducts: {
        orderBy: [{ retailer: "asc" }, { retailerProductName: "asc" }],
        select: {
          id: true, retailer: true, externalId: true, retailerProductName: true,
          brand: true, packSize: true, active: true,
          _count: { select: { priceObservations: true } },
        },
      },
      _count: {
        select: { aliases: true, shoppingItems: true, supermarketPrices: true, enrichmentJobs: true },
      },
    },
  });

  const mismatches = await prisma.priceObservation.count({
    where: {
      storeProductId: { not: null },
      product: { id: { in: ids } },
      NOT: { storeProduct: { productId: { equals: prisma.priceObservation.fields.productId } } },
    },
  }).catch(() => null);

  console.log(JSON.stringify({ products, observationOwnershipMismatchCount: mismatches }, null, 2));
}

main().finally(() => prisma.$disconnect());
