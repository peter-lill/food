import { EnrichmentJobStatus, ProductLifecycle } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCatalogueQualityMetrics, inspectProductQuality } from "@/lib/product-intelligence/product-quality-engine";
import { enrichProductFromRetailerLabels } from "@/lib/product-intelligence/retailer-label-enrichment";

const selfHealingProvider = "product-knowledge-self-healing-v2";

export async function getProductKnowledgeOperationsSummary() {
  const [quality, activeJobs, failedJobs, recentRepairs] = await Promise.all([
    getCatalogueQualityMetrics(5000),
    prisma.productEnrichmentJob.count({
      where: { status: { in: [EnrichmentJobStatus.QUEUED, EnrichmentJobStatus.RUNNING, EnrichmentJobStatus.RETRY_SCHEDULED] } },
    }),
    prisma.productEnrichmentJob.count({
      where: { status: EnrichmentJobStatus.FAILED },
    }),
    prisma.productEnrichmentJob.count({
      where: {
        provider: selfHealingProvider,
        status: EnrichmentJobStatus.COMPLETED,
        completedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
    }),
  ]);

  const issueCount = (code: string) => quality.issues.find((item) => item.code === code)?.count ?? 0;

  return {
    catalogueConfidence: quality.averageScore,
    products: quality.products,
    needsReview: quality.review + quality.broken,
    missingIngredients: issueCount("ingredients-missing") + issueCount("ingredients-placeholder"),
    missingServingSizes: issueCount("serving-size-missing"),
    brokenRetailerLinks: issueCount("retailer-link-missing"),
    providerFailures: failedJobs,
    activeJobs,
    recentRepairs,
  };
}

export async function runProductKnowledgeSelfHealing(batchSize = 10) {
  const requested = Math.max(1, Math.min(Math.floor(batchSize), 25));
  const quality = await getCatalogueQualityMetrics(5000);
  const candidates = quality.weakest
    .filter((item) => item.state === "broken" || item.state === "review" || item.state === "incomplete")
    .slice(0, requested);

  const results: Array<{
    productId: string;
    name: string;
    before: number;
    after: number;
    status: "repaired" | "improved" | "unchanged" | "failed";
    error?: string;
  }> = [];

  for (const candidate of candidates) {
    const job = await prisma.productEnrichmentJob.create({
      data: {
        productId: candidate.productId,
        provider: selfHealingProvider,
        status: EnrichmentJobStatus.RUNNING,
        startedAt: new Date(),
        attempts: 1,
        priority: Math.max(1, 100 - candidate.score),
      },
      select: { id: true },
    });

    try {
      // Product identity fields are protected. Self-healing may enrich label data
      // and update quality metadata, but it must never overwrite the canonical name.
      await enrichProductFromRetailerLabels(candidate.productId).catch(() => ({ status: "not-found" as const }));
      const inspection = await inspectProductQuality(candidate.productId);
      const after = inspection?.score ?? candidate.score;
      const resolved = Boolean(inspection && (inspection.state === "verified" || inspection.state === "enriched"));
      const improved = after > candidate.score;

      await prisma.product.update({
        where: { id: candidate.productId },
        data: {
          confidenceScore: after / 100,
          lifecycle: resolved
            ? ProductLifecycle.READY
            : inspection?.state === "broken" || inspection?.state === "review"
              ? ProductLifecycle.REVIEW_REQUIRED
              : ProductLifecycle.ENRICHING,
        },
      });

      await prisma.productEnrichmentJob.update({
        where: { id: job.id },
        data: {
          status: EnrichmentJobStatus.COMPLETED,
          completedAt: new Date(),
          lastError: resolved || improved ? null : "Self-healing completed without improving product confidence. Product identity was not modified.",
        },
      });

      results.push({
        productId: candidate.productId,
        name: candidate.name,
        before: candidate.score,
        after,
        status: resolved ? "repaired" : improved ? "improved" : "unchanged",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await prisma.productEnrichmentJob.update({
        where: { id: job.id },
        data: {
          status: EnrichmentJobStatus.FAILED,
          completedAt: new Date(),
          lastError: message.slice(0, 500),
        },
      }).catch(() => undefined);
      results.push({
        productId: candidate.productId,
        name: candidate.name,
        before: candidate.score,
        after: candidate.score,
        status: "failed",
        error: message,
      });
    }
  }

  return {
    processed: results.length,
    repaired: results.filter((item) => item.status === "repaired").length,
    improved: results.filter((item) => item.status === "improved").length,
    unchanged: results.filter((item) => item.status === "unchanged").length,
    failed: results.filter((item) => item.status === "failed").length,
    results,
  };
}
