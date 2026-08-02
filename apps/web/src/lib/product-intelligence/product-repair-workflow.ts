import { EnrichmentJobStatus, ProductLifecycle } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { validateProductName } from "@/lib/product-intelligence/product-name-quality";

const suggestionProvider = "product-name-repair-suggestion-v1";
const historyProvider = "product-field-history-v1";

type SuggestionPayload = {
  kind: "repair-suggestion";
  field: "name";
  previousValue: string;
  proposedValue: string;
  rule: string;
  confidence: number;
  issues: string[];
  createdBy: string;
};

type HistoryPayload = {
  kind: "field-change";
  field: "name";
  previousValue: string;
  nextValue: string;
  rule: string;
  action: "apply" | "rollback";
  actorEmail: string;
  sourceSuggestionId?: string;
};

function encodePayload(payload: SuggestionPayload | HistoryPayload) {
  return JSON.stringify(payload);
}

function decodePayload<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function repairRule(current: string, proposed: string, issues: string[]) {
  if (/^[\s.,;:!?·•]+/.test(current) && current.replace(/^[\s.,;:!?·•]+/, "").trim() === proposed) {
    return { rule: "remove-leading-punctuation", confidence: 100 };
  }
  if (issues.includes("name-contaminated")) {
    return { rule: "remove-css-or-markup-contamination", confidence: 95 };
  }
  return { rule: "normalise-product-name", confidence: 85 };
}

export async function queueProductNameRepairSuggestions(limit = 500, actorEmail = "system") {
  const products = await prisma.product.findMany({
    orderBy: { updatedAt: "asc" },
    take: Math.max(1, Math.min(Math.floor(limit), 2000)),
    select: { id: true, name: true },
  });

  let queued = 0;
  let alreadyQueued = 0;
  let unchanged = 0;
  let reviewRequired = 0;

  for (const product of products) {
    const validation = validateProductName(product.name);
    const proposed = validation.sanitised?.trim() ?? null;

    if (!validation.changed || !proposed || proposed === product.name.trim()) {
      unchanged += 1;
      continue;
    }

    if (!validation.valid) {
      reviewRequired += 1;
      continue;
    }

    const existing = await prisma.productEnrichmentJob.findFirst({
      where: {
        productId: product.id,
        provider: suggestionProvider,
        status: EnrichmentJobStatus.QUEUED,
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, lastError: true },
    });
    const existingPayload = decodePayload<SuggestionPayload>(existing?.lastError ?? null);
    if (existingPayload?.previousValue === product.name && existingPayload.proposedValue === proposed) {
      alreadyQueued += 1;
      continue;
    }

    if (existing) {
      await prisma.productEnrichmentJob.update({
        where: { id: existing.id },
        data: { status: EnrichmentJobStatus.FAILED, completedAt: new Date() },
      });
    }

    const repair = repairRule(product.name, proposed, validation.issues);
    const payload: SuggestionPayload = {
      kind: "repair-suggestion",
      field: "name",
      previousValue: product.name,
      proposedValue: proposed,
      rule: repair.rule,
      confidence: repair.confidence,
      issues: validation.issues,
      createdBy: actorEmail,
    };

    await prisma.productEnrichmentJob.create({
      data: {
        productId: product.id,
        provider: suggestionProvider,
        status: EnrichmentJobStatus.QUEUED,
        priority: 100 - repair.confidence,
        attempts: 0,
        lastError: encodePayload(payload),
      },
    });
    queued += 1;
  }

  return { scanned: products.length, queued, alreadyQueued, unchanged, reviewRequired };
}

export async function getProductRepairQueue() {
  const jobs = await prisma.productEnrichmentJob.findMany({
    where: { provider: suggestionProvider, status: EnrichmentJobStatus.QUEUED },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    include: { product: { select: { id: true, name: true, brand: true, category: true } } },
  });

  return jobs.flatMap((job) => {
    const payload = decodePayload<SuggestionPayload>(job.lastError);
    if (!payload || payload.kind !== "repair-suggestion") return [];
    return [{
      id: job.id,
      productId: job.productId,
      productName: job.product.name,
      brand: job.product.brand,
      category: job.product.category,
      previousValue: payload.previousValue,
      proposedValue: payload.proposedValue,
      rule: payload.rule,
      confidence: payload.confidence,
      issues: payload.issues,
      createdAt: job.createdAt,
    }];
  });
}

export async function approveProductRepair(suggestionId: string, actorEmail: string) {
  return prisma.$transaction(async (tx) => {
    const job = await tx.productEnrichmentJob.findUnique({
      where: { id: suggestionId },
      include: { product: { select: { id: true, name: true } } },
    });
    const payload = decodePayload<SuggestionPayload>(job?.lastError ?? null);
    if (!job || job.provider !== suggestionProvider || job.status !== EnrichmentJobStatus.QUEUED || !payload) {
      throw new Error("Repair suggestion is no longer available.");
    }
    if (job.product.name !== payload.previousValue) {
      await tx.productEnrichmentJob.update({
        where: { id: job.id },
        data: { status: EnrichmentJobStatus.FAILED, completedAt: new Date() },
      });
      throw new Error("Product name changed after this suggestion was created. Generate a new suggestion.");
    }

    await tx.product.update({
      where: { id: job.productId },
      data: { name: payload.proposedValue, lifecycle: ProductLifecycle.REVIEW_REQUIRED },
    });

    const history: HistoryPayload = {
      kind: "field-change",
      field: "name",
      previousValue: payload.previousValue,
      nextValue: payload.proposedValue,
      rule: payload.rule,
      action: "apply",
      actorEmail,
      sourceSuggestionId: job.id,
    };
    await tx.productEnrichmentJob.create({
      data: {
        productId: job.productId,
        provider: historyProvider,
        status: EnrichmentJobStatus.COMPLETED,
        attempts: 1,
        startedAt: new Date(),
        completedAt: new Date(),
        lastError: encodePayload(history),
      },
    });
    await tx.productEnrichmentJob.update({
      where: { id: job.id },
      data: { status: EnrichmentJobStatus.COMPLETED, attempts: 1, startedAt: new Date(), completedAt: new Date() },
    });
    return { productId: job.productId, name: payload.proposedValue };
  });
}

export async function rejectProductRepair(suggestionId: string, actorEmail: string) {
  const job = await prisma.productEnrichmentJob.findUnique({ where: { id: suggestionId } });
  const payload = decodePayload<SuggestionPayload>(job?.lastError ?? null);
  if (!job || job.provider !== suggestionProvider || job.status !== EnrichmentJobStatus.QUEUED || !payload) {
    throw new Error("Repair suggestion is no longer available.");
  }
  const rejected = { ...payload, rejectedBy: actorEmail, rejectedAt: new Date().toISOString() };
  await prisma.productEnrichmentJob.update({
    where: { id: job.id },
    data: { status: EnrichmentJobStatus.FAILED, attempts: 1, completedAt: new Date(), lastError: JSON.stringify(rejected) },
  });
}

export async function getProductFieldHistory(productId: string) {
  const jobs = await prisma.productEnrichmentJob.findMany({
    where: { productId, provider: historyProvider, status: EnrichmentJobStatus.COMPLETED },
    orderBy: { completedAt: "desc" },
  });
  return jobs.flatMap((job) => {
    const payload = decodePayload<HistoryPayload>(job.lastError);
    if (!payload || payload.kind !== "field-change") return [];
    return [{ id: job.id, ...payload, changedAt: job.completedAt ?? job.updatedAt }];
  });
}

export async function rollbackProductNameChange(historyId: string, actorEmail: string) {
  return prisma.$transaction(async (tx) => {
    const historyJob = await tx.productEnrichmentJob.findUnique({
      where: { id: historyId },
      include: { product: { select: { id: true, name: true } } },
    });
    const payload = decodePayload<HistoryPayload>(historyJob?.lastError ?? null);
    if (!historyJob || historyJob.provider !== historyProvider || !payload || payload.field !== "name") {
      throw new Error("Change history entry was not found.");
    }
    if (historyJob.product.name !== payload.nextValue) {
      throw new Error("This change cannot be rolled back because the product name has changed again.");
    }

    await tx.product.update({
      where: { id: historyJob.productId },
      data: { name: payload.previousValue, lifecycle: ProductLifecycle.REVIEW_REQUIRED },
    });
    const rollback: HistoryPayload = {
      kind: "field-change",
      field: "name",
      previousValue: payload.nextValue,
      nextValue: payload.previousValue,
      rule: `rollback:${payload.rule}`,
      action: "rollback",
      actorEmail,
    };
    await tx.productEnrichmentJob.create({
      data: {
        productId: historyJob.productId,
        provider: historyProvider,
        status: EnrichmentJobStatus.COMPLETED,
        attempts: 1,
        startedAt: new Date(),
        completedAt: new Date(),
        lastError: encodePayload(rollback),
      },
    });
    return { productId: historyJob.productId, name: payload.previousValue };
  });
}

export const productRepairProviders = { suggestionProvider, historyProvider } as const;
