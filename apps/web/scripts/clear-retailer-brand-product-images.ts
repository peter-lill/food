import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { isRetailerBrandImageUrl } from "../src/lib/products/retailer-brand-image";

const apply = process.argv.includes("--apply");

type ProductImageRow = {
  id: string;
  slug: string | null;
  name: string;
  imageUrl: string | null;
};

async function main() {
  const products = await prisma.product.findMany({
    where: { imageUrl: { not: null } },
    select: { id: true, slug: true, name: true, imageUrl: true },
    orderBy: { name: "asc" },
  });
  const matches = (products as ProductImageRow[]).filter((product) => isRetailerBrandImageUrl(product.imageUrl));

  console.table(matches.map((product) => ({ name: product.name, slug: product.slug, imageUrl: product.imageUrl })));
  console.log(`Found ${matches.length} product image${matches.length === 1 ? "" : "s"} that point to retailer branding.`);

  if (!apply) {
    console.log("Report only. Run npm run products:images:clear-retailer-brand-assets:apply to clear these invalid images and reject their candidates.");
    return;
  }

  for (const product of matches) {
    await prisma.$transaction([
      prisma.$executeRaw`
        UPDATE "ProductImageCandidate"
        SET "rejected" = true,
            "accepted" = false,
            "selected" = false,
            "rejectionReasons" = CASE
              WHEN 'Retailer brand logo is not a product image' = ANY("rejectionReasons") THEN "rejectionReasons"
              ELSE array_append("rejectionReasons", 'Retailer brand logo is not a product image')
            END,
            "updatedAt" = NOW()
        WHERE "productId" = ${product.id}
          AND "url" ILIKE ANY(ARRAY['%wapple-logo%', '%woolworths-logo%', '%coles-logo%', '%aldi-logo%', '%drakes-logo%'])
      `,
      prisma.$executeRaw`
        UPDATE "Product"
        SET "imageUrl" = NULL,
            "primaryImageAssetId" = NULL,
            "lifecycle" = 'REVIEW_REQUIRED'::"ProductLifecycle",
            "updatedAt" = NOW()
        WHERE "id" = ${product.id}
      `,
    ]);
  }
  console.log(`Cleared ${matches.length} invalid retailer-brand product image${matches.length === 1 ? "" : "s"}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
