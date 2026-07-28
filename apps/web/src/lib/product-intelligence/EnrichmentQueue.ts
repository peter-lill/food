import { EnrichmentJobStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type {
  EnqueueProductEnrichmentInput,
  EnrichmentJobFilter,
} from "./types";

export class EnrichmentQueue {
  static async enqueue(input: EnqueueProductEnrichmentInput) {
    const provider = input.provider.replace(/\s+/g, " ").trim().toLocaleLowerCase("en-AU");
    if (!provider) throw new Error("An enrichment provider is required.");

    const existing = await prisma.productEnrichmentJob.findFirst({
      where: {
        productId: input.productId,
        provider,
        status: {
          in: [
            EnrichmentJobStatus.QUEUED,
            EnrichmentJobStatus.RUNNING,
            EnrichmentJobStatus.RETRY_SCHEDULED,
          ],
        },
      },
      orderBy: { createdAt: "desc" },
    });
    if (existing) return existing;

    return prisma.productEnrichmentJob.create({
      data: {
        productId: input.productId,
        provider,
        priority: input.priority ?? 100,
      },
    });
  }

  static list(filter: EnrichmentJobFilter = {}) {
    return prisma.productEnrichmentJob.findMany({
      where: {
        status: filter.status,
        productId: filter.productId,
      },
      include: {
        product: {
          select: { id: true, name: true, canonicalName: true, lifecycle: true },
        },
      },
      orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
      take: Math.min(Math.max(filter.take ?? 50, 1), 200),
    });
  }

  static async claimNext() {
    return prisma.$transaction(async (transaction) => {
      const next = await transaction.productEnrichmentJob.findFirst({
        where: {
          OR: [
            { status: EnrichmentJobStatus.QUEUED },
            {
              status: EnrichmentJobStatus.RETRY_SCHEDULED,
              nextRetryAt: { lte: new Date() },
            },
          ],
        },
        orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
      });
      if (!next) return null;

      const claimed = await transaction.productEnrichmentJob.updateMany({
        where: {
          id: next.id,
          status: next.status,
        },
        data: {
          status: EnrichmentJobStatus.RUNNING,
          startedAt: new Date(),
          attempts: { increment: 1 },
          lastError: null,
        },
      });
      if (claimed.count !== 1) return null;

      return transaction.productEnrichmentJob.findUnique({
        where: { id: next.id },
        include: { product: true },
      });
    });
  }

  static complete(id: string) {
    return prisma.productEnrichmentJob.update({
      where: { id },
      data: {
        status: EnrichmentJobStatus.COMPLETED,
        completedAt: new Date(),
        nextRetryAt: null,
        lastError: null,
      },
    });
  }

  static fail(id: string, error: unknown, retryAt?: Date) {
    const message = error instanceof Error ? error.message : String(error);
    return prisma.productEnrichmentJob.update({
      where: { id },
      data: {
        status: retryAt
          ? EnrichmentJobStatus.RETRY_SCHEDULED
          : EnrichmentJobStatus.FAILED,
        lastError: message.slice(0, 2_000),
        nextRetryAt: retryAt ?? null,
        completedAt: retryAt ? null : new Date(),
      },
    });
  }
}
