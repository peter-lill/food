import "dotenv/config";
import os from "node:os";
import process from "node:process";
import { randomUUID } from "node:crypto";
import { prisma } from "../src/lib/prisma";
import {
  claimBackgroundJob,
  completeBackgroundJob,
  failBackgroundJob,
  releaseStaleBackgroundJobs,
  type BackgroundJob,
} from "../src/lib/jobs/background-jobs";
import { handleBackgroundJob, providerForJob } from "../src/lib/jobs/worker-handlers";
import { EnrichmentQueue } from "../src/lib/product-intelligence/EnrichmentQueue";
import { enrichProductKnowledge } from "../src/lib/product-intelligence/barcode-enrichment";

const pollMs = Math.max(250, Number(process.env.FOOD_WORKER_POLL_MS ?? 1500));
const queue = process.env.FOOD_WORKER_QUEUE?.trim() || "default";
const once = process.argv.includes("--once");
const workerId = process.env.FOOD_WORKER_ID?.trim()
  || `${os.hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`;

const providerMinimumDelayMs: Record<string, number> = {
  woolworths: 5000,
  coles: 2000,
  "open-food-facts": 500,
  wikimedia: 500,
  default: 250,
};

const providerLastStartedAt = new Map<string, number>();
let stopping = false;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function respectProviderDelay(job: BackgroundJob) {
  const provider = providerForJob(job);
  const minimumDelay = providerMinimumDelayMs[provider] ?? providerMinimumDelayMs.default;
  const previous = providerLastStartedAt.get(provider) ?? 0;
  const waitMs = Math.max(0, previous + minimumDelay - Date.now());
  if (waitMs > 0) await sleep(waitMs);
  providerLastStartedAt.set(provider, Date.now());
  return provider;
}

function log(event: string, details: Record<string, unknown> = {}) {
  console.log(JSON.stringify({
    time: new Date().toISOString(),
    service: "food-worker",
    workerId,
    event,
    ...details,
  }));
}

async function processJob(job: BackgroundJob) {
  const provider = await respectProviderDelay(job);
  const started = Date.now();
  log("job.started", { jobId: job.id, type: job.type, attempts: job.attempts, provider });

  try {
    const result = await handleBackgroundJob(job);
    await completeBackgroundJob(job.id, result);
    log("job.completed", {
      jobId: job.id,
      type: job.type,
      provider,
      durationMs: Date.now() - started,
    });
  } catch (error) {
    await failBackgroundJob(job, error);
    log("job.retry_or_failed", {
      jobId: job.id,
      type: job.type,
      provider,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - started,
    });
  }
}

async function processProductEnrichmentJob(
  job: NonNullable<Awaited<ReturnType<typeof EnrichmentQueue.claimNext>>>,
) {
  const started = Date.now();
  log("product_enrichment.started", {
    jobId: job.id,
    productId: job.productId,
    provider: job.provider,
    attempts: job.attempts,
  });

  try {
    const result = await enrichProductKnowledge(job.productId);
    if (result.status === "failed" || result.status === "busy") {
      throw new Error(`Product enrichment returned ${result.status}.`);
    }
    await EnrichmentQueue.complete(job.id);
    log("product_enrichment.completed", {
      jobId: job.id,
      productId: job.productId,
      result: result.status,
      durationMs: Date.now() - started,
    });
  } catch (error) {
    const retryAt = job.attempts < 5
      ? new Date(Date.now() + Math.min(3600, 15 * 2 ** Math.max(0, job.attempts - 1)) * 1000)
      : undefined;
    await EnrichmentQueue.fail(job.id, error, retryAt);
    log("product_enrichment.retry_or_failed", {
      jobId: job.id,
      productId: job.productId,
      attempts: job.attempts,
      retryAt: retryAt?.toISOString() ?? null,
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - started,
    });
  }
}

async function main() {
  log("worker.starting", { queue, pollMs, once });
  const recovered = await releaseStaleBackgroundJobs();
  if (Number(recovered) > 0) log("jobs.recovered", { count: Number(recovered) });

  while (!stopping) {
    const backgroundJob = await claimBackgroundJob(workerId, queue);
    if (backgroundJob) {
      await processJob(backgroundJob);
      if (once) break;
      continue;
    }

    const productEnrichmentJob = await EnrichmentQueue.claimNext("default");
    if (productEnrichmentJob) {
      await processProductEnrichmentJob(productEnrichmentJob);
      if (once) break;
      continue;
    }

    if (once) break;
    await sleep(pollMs);
  }

  log("worker.stopped");
}

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    stopping = true;
    log("worker.stopping", { signal });
  });
}

main()
  .catch((error) => {
    log("worker.crashed", { error: error instanceof Error ? error.stack ?? error.message : String(error) });
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
