import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";

export const backgroundJobTypes = {
  productImageEnrichment: "PRODUCT_IMAGE_ENRICHMENT",
} as const;

export type BackgroundJobType = typeof backgroundJobTypes[keyof typeof backgroundJobTypes];
export type BackgroundJobStatus = "QUEUED" | "RUNNING" | "RETRY_SCHEDULED" | "COMPLETED" | "FAILED" | "CANCELLED";

export type BackgroundJob<TPayload = Record<string, unknown>> = {
  id: string;
  type: string;
  status: BackgroundJobStatus;
  queue: string;
  priority: number;
  payload: TPayload;
  attempts: number;
  maxAttempts: number;
  availableAt: Date;
  lockedAt: Date | null;
  lockedBy: string | null;
};

type EnqueueOptions = {
  queue?: string;
  priority?: number;
  maxAttempts?: number;
  availableAt?: Date;
  deduplicationKey?: string;
};

export async function enqueueBackgroundJob<TPayload extends Record<string, unknown>>(
  type: BackgroundJobType | string,
  payload: TPayload,
  options: EnqueueOptions = {},
) {
  const id = randomUUID();
  const queue = options.queue ?? "default";
  const priority = options.priority ?? 100;
  const maxAttempts = options.maxAttempts ?? 5;
  const availableAt = options.availableAt ?? new Date();
  const deduplicationKey = options.deduplicationKey ?? null;
  const payloadJson = JSON.stringify(payload);

  const rows = await prisma.$queryRaw<Array<{ id: string; created: boolean }>>`
    INSERT INTO "BackgroundJob" (
      "id", "type", "status", "queue", "priority", "payload", "deduplicationKey",
      "maxAttempts", "availableAt", "createdAt", "updatedAt"
    ) VALUES (
      ${id}, ${type}, 'QUEUED', ${queue}, ${priority}, ${payloadJson}::jsonb,
      ${deduplicationKey}, ${maxAttempts}, ${availableAt}, NOW(), NOW()
    )
    ON CONFLICT ("deduplicationKey")
      WHERE "deduplicationKey" IS NOT NULL
        AND "status" IN ('QUEUED', 'RUNNING', 'RETRY_SCHEDULED')
    DO UPDATE SET
      "priority" = LEAST("BackgroundJob"."priority", EXCLUDED."priority"),
      "availableAt" = LEAST("BackgroundJob"."availableAt", EXCLUDED."availableAt"),
      "updatedAt" = NOW()
    RETURNING "id", ("id" = ${id}) AS "created"
  `;

  return rows[0];
}

export async function claimBackgroundJob(workerId: string, queue = "default") {
  const rows = await prisma.$queryRaw<Array<BackgroundJob>>`
    WITH next_job AS (
      SELECT "id"
      FROM "BackgroundJob"
      WHERE "queue" = ${queue}
        AND "status" IN ('QUEUED', 'RETRY_SCHEDULED')
        AND "availableAt" <= NOW()
      ORDER BY "priority" ASC, "createdAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    UPDATE "BackgroundJob" AS job
    SET "status" = 'RUNNING',
        "lockedAt" = NOW(),
        "lockedBy" = ${workerId},
        "startedAt" = COALESCE("startedAt", NOW()),
        "attempts" = "attempts" + 1,
        "updatedAt" = NOW()
    FROM next_job
    WHERE job."id" = next_job."id"
    RETURNING job."id", job."type", job."status", job."queue", job."priority",
              job."payload", job."attempts", job."maxAttempts", job."availableAt",
              job."lockedAt", job."lockedBy"
  `;

  return rows[0] ?? null;
}

export async function completeBackgroundJob(jobId: string, result: Record<string, unknown> = {}) {
  await prisma.$executeRaw`
    UPDATE "BackgroundJob"
    SET "status" = 'COMPLETED',
        "result" = ${JSON.stringify(result)}::jsonb,
        "completedAt" = NOW(),
        "lockedAt" = NULL,
        "lockedBy" = NULL,
        "lastError" = NULL,
        "updatedAt" = NOW()
    WHERE "id" = ${jobId}
  `;
}

function retryDelaySeconds(attempts: number) {
  return Math.min(3600, 15 * 2 ** Math.max(0, attempts - 1));
}

export async function failBackgroundJob(job: BackgroundJob, error: unknown) {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  const exhausted = job.attempts >= job.maxAttempts;
  const delaySeconds = retryDelaySeconds(job.attempts);

  if (exhausted) {
    await prisma.$executeRaw`
      UPDATE "BackgroundJob"
      SET "status" = 'FAILED',
          "lastError" = ${message},
          "failedAt" = NOW(),
          "lockedAt" = NULL,
          "lockedBy" = NULL,
          "updatedAt" = NOW()
      WHERE "id" = ${job.id}
    `;
    return;
  }

  await prisma.$executeRaw`
    UPDATE "BackgroundJob"
    SET "status" = 'RETRY_SCHEDULED',
        "lastError" = ${message},
        "availableAt" = NOW() + (${delaySeconds} * INTERVAL '1 second'),
        "lockedAt" = NULL,
        "lockedBy" = NULL,
        "updatedAt" = NOW()
    WHERE "id" = ${job.id}
  `;
}

export async function releaseStaleBackgroundJobs(staleAfterMinutes = 15) {
  return prisma.$executeRaw`
    UPDATE "BackgroundJob"
    SET "status" = 'RETRY_SCHEDULED',
        "availableAt" = NOW(),
        "lockedAt" = NULL,
        "lockedBy" = NULL,
        "lastError" = COALESCE("lastError", 'Worker lock expired'),
        "updatedAt" = NOW()
    WHERE "status" = 'RUNNING'
      AND "lockedAt" < NOW() - (${staleAfterMinutes} * INTERVAL '1 minute')
  `;
}

export async function getBackgroundJobStats() {
  return prisma.$queryRaw<Array<{ status: BackgroundJobStatus; count: bigint }>>`
    SELECT "status", COUNT(*)::bigint AS "count"
    FROM "BackgroundJob"
    GROUP BY "status"
    ORDER BY "status"
  `;
}
