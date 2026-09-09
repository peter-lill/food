import { Prisma } from "@prisma/client";
import { backgroundJobTypes, enqueueBackgroundJob } from "@/lib/jobs/background-jobs";
import { prisma } from "@/lib/prisma";

type CatalogueImage = {
  productId: string;
  imageUrl: string | null;
};

export async function promoteCatalogueProductImages(
  tx: Prisma.TransactionClient,
  images: CatalogueImage[],
) {
  const usable = [...new Map(
    images
      .filter((image): image is { productId: string; imageUrl: string } => Boolean(image.imageUrl?.trim()))
      .map((image) => [image.productId, image]),
  ).values()];
  if (!usable.length) return 0;

  const rows = usable.map((image) => Prisma.sql`(${image.productId}, ${image.imageUrl})`);
  return tx.$executeRaw(Prisma.sql`
    UPDATE "Product" AS product
    SET "imageUrl" = source."imageUrl", "updatedAt" = NOW()
    FROM (VALUES ${Prisma.join(rows)}) AS source("productId", "imageUrl")
    WHERE product."id" = source."productId"
      AND product."imageUrl" IS NULL
      AND source."imageUrl" IS NOT NULL
  `);
}

export async function enqueueMissingCatalogueProductImages(
  productIds: string[],
  provider: string,
) {
  const uniqueIds = [...new Set(productIds)];
  if (!uniqueIds.length) return { queued: 0, existing: 0 };

  const missing = await prisma.product.findMany({
    where: {
      id: { in: uniqueIds },
      imageUrl: null,
      lifecycle: { not: "ARCHIVED" },
    },
    select: { id: true },
  });

  let queued = 0;
  let existing = 0;
  for (let offset = 0; offset < missing.length; offset += 25) {
    const results = await Promise.all(missing.slice(offset, offset + 25).map((product) =>
      enqueueBackgroundJob(
        backgroundJobTypes.productImageEnrichment,
        { productId: product.id, provider, allowGenerated: false },
        {
          priority: 140,
          maxAttempts: 5,
          deduplicationKey: `catalogue-product-image:${product.id}`,
        },
      ),
    ));
    queued += results.filter((result) => result?.created).length;
    existing += results.filter((result) => !result?.created).length;
  }

  return { queued, existing };
}
