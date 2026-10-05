import "dotenv/config";

import { prisma } from "../src/lib/prisma";

const STORE_PRODUCT_IDS = [
  "7de8781b-d56e-4464-b27b-4f57ad0d7265",
  "e7a92a12-0747-4a5a-8484-c9c797fbb417",
  "cab29f06-03ea-48b4-81ac-1ce9ac3055f1",
];

async function main() {
  const rows = [];
  for (const id of STORE_PRODUCT_IDS) {
    const storeProduct = await prisma.storeProduct.findUnique({
      where: { id },
      select: {
        id: true, productId: true, retailer: true, externalId: true,
        retailerProductName: true, brand: true, packSize: true, active: true,
        product: { select: { id: true, name: true, canonicalName: true, brand: true, barcode: true, packSize: true } },
      },
    });
    if (!storeProduct) continue;

    const grouped = await prisma.priceObservation.groupBy({
      by: ["productId"],
      where: { storeProductId: id },
      _count: { _all: true },
      _min: { observedAt: true },
      _max: { observedAt: true },
    });

    const productIds = grouped.map((g) => g.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true, canonicalName: true, brand: true, barcode: true, packSize: true },
    });
    const productById = new Map(products.map((p) => [p.id, p]));

    rows.push({
      storeProduct,
      observationOwnership: grouped.map((g) => ({
        productId: g.productId,
        count: g._count._all,
        firstObservedAt: g._min.observedAt,
        lastObservedAt: g._max.observedAt,
        product: productById.get(g.productId) ?? null,
      })),
    });
  }

  console.log(JSON.stringify({ mode: "read-only", rows }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
