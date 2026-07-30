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
  }>>`
    SELECT c."id", c."productId", c."source", p."name" AS "productName"
    FROM "ProductImageCandidate" c
    JOIN "Product" p ON p."id" = c."productId"
    WHERE c."selected" = true
      AND c."assetId" IS NULL
    ORDER BY c."updatedAt" ASC
  `;

  let created = 0;
  let existing = 0;
  for (const candidate of candidates) {
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
    console.log(`${result?.created ? "Queued" : "Already queued"}: ${candidate.productName}`);
  }

  console.log(`Complete. Queued: ${created}. Existing active jobs: ${existing}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
