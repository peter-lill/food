import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { ProductImageAssessment } from "@/lib/products/image-quality";

export type DiscoveredImageCandidate = {
  url: string;
  source: string;
  sourceLabel?: string;
  identityScore?: number | null;
  providerScore?: number | null;
};

export async function recordDiscoveredCandidate(productId: string, candidate: DiscoveredImageCandidate) {
  const existing = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "ProductImageCandidate"
    WHERE "productId" = ${productId} AND "url" = ${candidate.url}
    LIMIT 1
  `;

  if (existing[0]) {
    await prisma.$executeRaw`
      UPDATE "ProductImageCandidate"
      SET "source" = ${candidate.source},
          "sourceLabel" = ${candidate.sourceLabel ?? candidate.source},
          "identityScore" = ${candidate.identityScore ?? null},
          "providerScore" = ${candidate.providerScore ?? null},
          "lastSeenAt" = NOW(),
          "updatedAt" = NOW()
      WHERE "id" = ${existing[0].id}
    `;
    return existing[0].id;
  }

  const id = randomUUID();
  await prisma.$executeRaw`
    INSERT INTO "ProductImageCandidate" (
      "id", "productId", "url", "source", "sourceLabel", "score",
      "rejected", "selected", "identityScore", "providerScore",
      "accepted", "rejectionReasons", "createdAt", "updatedAt", "lastSeenAt"
    ) VALUES (
      ${id}, ${productId}, ${candidate.url}, ${candidate.source},
      ${candidate.sourceLabel ?? candidate.source}, 0,
      false, false, ${candidate.identityScore ?? null}, ${candidate.providerScore ?? null},
      false, ARRAY[]::TEXT[], NOW(), NOW(), NOW()
    )
  `;
  return id;
}

export async function recordCandidateAssessment(input: {
  candidateId: string;
  assessment: ProductImageAssessment;
  accepted: boolean;
  rejectionReasons: string[];
  overallScore: number;
}) {
  await prisma.$executeRaw`
    UPDATE "ProductImageCandidate"
    SET "width" = ${input.assessment.width},
        "height" = ${input.assessment.height},
        "contentType" = ${input.assessment.contentType},
        "fileSizeBytes" = ${input.assessment.contentLength},
        "qualityScore" = ${input.assessment.score},
        "overallScore" = ${input.overallScore},
        "score" = ${input.overallScore},
        "accepted" = ${input.accepted},
        "rejectionReasons" = ${input.rejectionReasons},
        "lastCheckedAt" = NOW(),
        "updatedAt" = NOW()
    WHERE "id" = ${input.candidateId}
  `;
}

export async function markSelectedCandidate(productId: string, candidateId: string) {
  await prisma.$transaction([
    prisma.$executeRaw`
      UPDATE "ProductImageCandidate"
      SET "selected" = false, "updatedAt" = NOW()
      WHERE "productId" = ${productId}
    `,
    prisma.$executeRaw`
      UPDATE "ProductImageCandidate"
      SET "selected" = true,
          "accepted" = true,
          "rejected" = false,
          "updatedAt" = NOW()
      WHERE "id" = ${candidateId}
    `,
  ]);
}
