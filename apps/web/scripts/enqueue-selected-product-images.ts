import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { enqueueBackgroundJob } from "../src/lib/jobs/background-jobs";
import { workerJobTypes } from "../src/lib/jobs/worker-handlers";
import { assessProductImage } from "../src/lib/products/image-quality";
import {
  imageCandidateOverallScore,
  usableImageCandidateAssessment,
} from "../src/lib/products/image-candidate-score";
import { recordCandidateAssessment } from "../src/lib/products/image-candidate.repository";

const reassessmentLimitArgument = process.argv.find((argument) => argument.startsWith("--reassess-limit="));
const parsedReassessmentLimit = Number(reassessmentLimitArgument?.split("=", 2)[1] ?? 5000);
const reassessmentLimit = Number.isFinite(parsedReassessmentLimit)
  ? Math.max(0, Math.floor(parsedReassessmentLimit))
  : 5000;
const reassessmentConcurrency = 6;

async function reassessBlockedAuthoritativeCandidates() {
  if (!reassessmentLimit) return { checked: 0, recovered: 0 };

  const candidates = await prisma.$queryRaw<Array<{
    id: string;
    url: string;
    providerScore: number;
    identityScore: number;
  }>>`
    SELECT c."id", c."url", c."providerScore", c."identityScore"
    FROM "ProductImageCandidate" c
    JOIN "Product" p ON p."id" = c."productId"
    WHERE c."rejected" = false
      AND c."selected" = false
      AND c."accepted" = false
      AND COALESCE(c."qualityScore", 0) = 0
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
    ORDER BY c."updatedAt" DESC
    LIMIT ${reassessmentLimit}
  `;

  let checked = 0;
  let recovered = 0;
  for (let offset = 0; offset < candidates.length; offset += reassessmentConcurrency) {
    const batch = candidates.slice(offset, offset + reassessmentConcurrency);
    await Promise.all(batch.map(async (candidate) => {
      const assessment = await assessProductImage(candidate.url);
      const accepted = usableImageCandidateAssessment(assessment);
      const overallScore = imageCandidateOverallScore({
        qualityScore: assessment.score,
        providerScore: candidate.providerScore,
        identityScore: candidate.identityScore,
      });
      await recordCandidateAssessment({
        candidateId: candidate.id,
        assessment,
        accepted,
        rejectionReasons: accepted ? [] : assessment.issues,
        overallScore,
      });
      checked += 1;
      if (accepted) recovered += 1;
    }));
    if (checked % 100 === 0 || checked === candidates.length) {
      console.log(`Reassessment progress: ${checked}/${candidates.length}; recovered ${recovered}.`);
    }
  }
  return { checked, recovered };
}

async function main() {
  const reassessed = await reassessBlockedAuthoritativeCandidates();
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
        AND (
          (
            c."selected" = true
            AND (c."assetId" IS NULL OR p."primaryImageAssetId" IS DISTINCT FROM c."assetId")
          )
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

  console.log(`Complete. Reassessed: ${reassessed.checked}; recovered: ${reassessed.recovered}; promoted: ${promoted}; queued: ${created}; existing active jobs: ${existing}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
