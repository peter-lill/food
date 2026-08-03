import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { importCandidateAsset } from "../src/lib/images/image-asset.service";

async function main() {
  const selected = await prisma.$queryRaw<Array<{ productId: string; candidateId: string; productName: string }>>`
    SELECT c."productId", c."id" AS "candidateId", p."name" AS "productName"
    FROM "ProductImageCandidate" c
    JOIN "Product" p ON p."id" = c."productId"
    WHERE c."selected" = true
      AND c."rejected" = false
      AND c."assetId" IS NULL
    ORDER BY c."updatedAt" DESC
  `;

  console.log(`Importing ${selected.length} selected product image candidate(s).`);
  let imported = 0;
  let failed = 0;

  for (const item of selected) {
    try {
      const asset = await importCandidateAsset(item.productId, item.candidateId);
      await prisma.$executeRaw`
        UPDATE "Product"
        SET "primaryImageAssetId" = ${asset.id}, "updatedAt" = NOW()
        WHERE "id" = ${item.productId}
      `;
      imported += 1;
      console.log(`✓ ${item.productName} -> ${asset.id}`);
    } catch (error) {
      failed += 1;
      console.error(`✕ ${item.productName}:`, error instanceof Error ? error.message : String(error));
    }
  }

  console.log(`Complete. Imported: ${imported}. Failed: ${failed}.`);
  if (failed) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
