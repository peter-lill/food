import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { enqueueBackgroundJob } from "../src/lib/jobs/background-jobs";
import { workerJobTypes } from "../src/lib/jobs/worker-handlers";

async function main() {
  const candidates = await prisma.$queryRaw<Array<{
    id: string;
    productId: string;
    source: string;
    productName: string;
    url: string;
    selected: boolean;
  }>>`
    WITH ranked AS (
      SELECT c."id", c."productId", c."source", c."url", c."selected",
             p."name" AS "productName",
             ROW_NUMBER() OVER (
               PARTITION BY c."productId"
               ORDER BY c."selected" DESC,
                        COALESCE(c."providerScore", 0) DESC,
                        COALESCE(c."identityScore", 0) DESC,
                        COALESCE(c."overallScore", c."score", 0) DESC,
                        c."updatedAt" DESC
             ) AS candidate_rank
      FROM "ProductImageCandidate" c
      JOIN "Product" p ON p."id" = c."productId"
      WHERE c."rejected" = false
        AND c."assetId" IS NULL
        AND (
          c."selected" = true
          OR (
            c."accepted" = true
            AND COALESCE(c."overallScore", c."score", 0) >= 75
            AND COALESCE(c."identityScore", 0) >= 90
            AND COALESCE(c."providerScore", 0) >= 90
            AND p."primaryImageAssetId" IS NULL
            AND NOT EXISTS (
              SELECT 1
              FROM "ProductImageCandidate" selected
              WHERE selected."productId" = c."productId"
                AND selected."selected" = true
                AND selected."rejected" = false
            )
          )
        )
    )
    SELECT "id", "productId", "source", "url", "selected", "productName"
    FROM ranked
    WHERE candidate_rank = 1
    ORDER BY "selected" DESC, "productName" ASC
  `;

  let created = 0;
  let existing = 0;
  let promoted = 0;
  for (const candidate of candidates) {
    if (!candidate.selected) {
      await prisma.$transaction([
        prisma.$executeRaw`
          UPDATE "ProductImageCandidate"
          SET "selected" = false, "updatedAt" = NOW()
          WHERE "productId" = ${candidate.productId}
        `,
        prisma.$executeRaw`
          UPDATE "ProductImageCandidate"
          SET "selected" = true, "accepted" = true, "updatedAt" = NOW()
          WHERE "id" = ${candidate.id} AND "productId" = ${candidate.productId}
        `,
        prisma.product.update({
          where: { id: candidate.productId },
          data: { imageUrl: candidate.url, lifecycle: "READY" },
        }),
      ]);
      promoted += 1;
    }

    const result = await enqueueBackgroundJob(
      workerJobTypes.importProductImage,
      {
        productId: candidate.productId,
        candidateId: candidate.id,
        provider: candidate.source,
      },
      {
        queue: "default",
        priority: 50,
        maxAttempts: 8,
        deduplicationKey: `import-product-image:${candidate.productId}:${candidate.id}`,
      },
    );

    if (result?.created) created += 1;
    else existing += 1;
    console.log(`${candidate.selected ? "Selected" : "Promoted"} / ${result?.created ? "queued" : "already queued"}: ${candidate.productName}`);
  }

  console.log(`Complete. Promoted: ${promoted}. Queued: ${created}. Existing active jobs: ${existing}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
