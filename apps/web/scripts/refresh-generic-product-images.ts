import { prisma } from "../src/lib/prisma";
import { backgroundJobTypes, enqueueBackgroundJob } from "../src/lib/jobs/background-jobs";

const apply = process.argv.includes("--apply");

async function main() {
  const products = await prisma.product.findMany({
    where: {
      lifecycle: { not: "ARCHIVED" },
      brand: null,
      barcode: null,
      ingredientRecords: { some: {} },
    },
    select: { id: true, name: true, canonicalName: true, imageUrl: true },
    orderBy: { name: "asc" },
  });

  console.log(`${apply ? "Refreshing" : "Would refresh"} ${products.length} generic family image(s).`);
  for (const product of products) {
    console.log(`- ${product.canonicalName ?? product.name}${product.imageUrl ? " (replacing current image)" : ""}`);
    if (!apply) continue;
    await prisma.$transaction([
      prisma.$executeRaw`
        UPDATE "Product"
        SET "imageUrl" = NULL, "primaryImageAssetId" = NULL,
            "lifecycle" = 'REVIEW_REQUIRED'::"ProductLifecycle", "updatedAt" = NOW()
        WHERE "id" = ${product.id}
      `,
      prisma.$executeRaw`
        UPDATE "ProductImageCandidate"
        SET "selected" = false, "updatedAt" = NOW()
        WHERE "productId" = ${product.id}
      `,
    ]);
    await enqueueBackgroundJob(
      backgroundJobTypes.productImageEnrichment,
      { productId: product.id },
      { deduplicationKey: `generic-family-image:${product.id}`, priority: 120, maxAttempts: 3 },
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
