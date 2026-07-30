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

async function main() {
  log("worker.starting", { queue, pollMs, once });
  const recovered = await releaseStaleBackgroundJobs();
  if (Number(recovered) > 0) log("jobs.recovered", { count: Number(recovered) });

  while (!stopping) {
    const job = await claimBackgroundJob(workerId, queue);
    if (!job) {
      if (once) break;
      await sleep(pollMs);
      continue;
    }

    await processJob(job);
    if (once) break;
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
