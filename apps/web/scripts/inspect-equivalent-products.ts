import "dotenv/config";
import { prisma } from "/home/peter/Development/food/apps/web/src/lib/prisma";

async function main() {
  const products = await prisma.product.findMany({
    where: {
      OR: [
        { id: "5c942a88-a6e2-4e48-ab3a-286bcf4e74b1" },
        { id: "3ccaaff0-2b66-493d-86aa-d063392dc1a3" },
        { id: "cmuvqi3y70000ovhea1tw75fl" },
        { id: "6545ccde-5426-4eaf-9f5f-78bef417a02d" }
      ]
    },
    select: {
      id: true,
      name: true,
      canonicalName: true,
      brand: true,
      barcode: true,
      category: true,
      packSize: true,
      packQuantity: true,
      packUnit: true,
      lifecycle: true,
      confidenceScore: true,
      foodKnowledgeId: true,
      createdAt: true,
      updatedAt: true,

      storeProducts: {
        orderBy: [
          { retailer: "asc" },
          { retailerProductName: "asc" }
        ],
        select: {
          id: true,
          retailer: true,
          externalId: true,
          retailerProductName: true,
          brand: true,
          packSize: true,
          packQuantity: true,
          packUnit: true,
          active: true,
          lastSeenAt: true,
          _count: {
            select: {
              priceObservations: true
            }
          }
        }
      },

      _count: {
        select: {
          priceObservations: true,
          aliases: true,
          inventoryItems: true,
          ingredientRecords: true,
          shoppingItems: true,
          receiptItems: true,
          supermarketPrices: true,
          enrichmentJobs: true
        }
      }
    }
  });

  for (const product of products) {
    console.log("\n============================================================");
    console.log(`PRODUCT ${product.id}`);
    console.log("============================================================");

    console.log({
      name: product.name,
      canonicalName: product.canonicalName,
      brand: product.brand,
      barcode: product.barcode,
      category: product.category,
      packSize: product.packSize,
      packQuantity: product.packQuantity,
      packUnit: product.packUnit,
      lifecycle: product.lifecycle,
      confidenceScore: product.confidenceScore,
      foodKnowledgeId: product.foodKnowledgeId,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
      relations: product._count
    });

    console.log("\nSTORE PRODUCTS");

    for (const sp of product.storeProducts) {
      console.log({
        id: sp.id,
        retailer: sp.retailer,
        externalId: sp.externalId,
        retailerProductName: sp.retailerProductName,
        brand: sp.brand,
        packSize: sp.packSize,
        packQuantity: sp.packQuantity,
        packUnit: sp.packUnit,
        active: sp.active,
        lastSeenAt: sp.lastSeenAt,
        observations: sp._count.priceObservations
      });
    }
  }

  console.log("\n============================================================");
  console.log(`FOUND ${products.length} PRODUCTS`);
  console.log("============================================================");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
