import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { enqueueMissingCatalogueProductImages } from "../src/lib/products/catalogue-image-enrichment";

async function main() {
  const promoted = await prisma.$executeRaw`
    WITH best_retailer_image AS (
      SELECT DISTINCT ON (listing."productId")
        listing."productId", listing."imageUrl"
      FROM "StoreProduct" listing
      WHERE listing."active" = true
        AND listing."imageUrl" IS NOT NULL
        AND btrim(listing."imageUrl") <> ''
      ORDER BY listing."productId", listing."lastSeenAt" DESC, listing."updatedAt" DESC
    )
    UPDATE "Product" product
    SET "imageUrl" = image."imageUrl", "updatedAt" = NOW()
    FROM best_retailer_image image
    WHERE product."id" = image."productId"
      AND product."imageUrl" IS NULL
  `;

  const unresolved = await prisma.product.findMany({
    where: {
      imageUrl: null,
      lifecycle: { not: "ARCHIVED" },
      OR: [
        { barcode: { not: null } },
        { storeProducts: { some: { active: true } } },
      ],
    },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });

  let queued = 0;
  let existing = 0;
  for (let offset = 0; offset < unresolved.length; offset += 500) {
    const result = await enqueueMissingCatalogueProductImages(
      unresolved.slice(offset, offset + 500).map((product) => product.id),
      "coles-woolworths",
    );
    queued += result.queued;
    existing += result.existing;
  }

  console.log(JSON.stringify({ promoted: Number(promoted), unresolved: unresolved.length, queued, existing }));
}

void main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
