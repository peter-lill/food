CREATE TABLE "BackgroundJob" (
  "id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'QUEUED',
  "queue" TEXT NOT NULL DEFAULT 'default',
  "priority" INTEGER NOT NULL DEFAULT 100,
  "payload" JSONB NOT NULL DEFAULT '{}'::JSONB,
  "result" JSONB,
  "deduplicationKey" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 5,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedAt" TIMESTAMP(3),
  "lockedBy" TEXT,
  "lastError" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "BackgroundJob_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BackgroundJob_status_check" CHECK ("status" IN ('QUEUED', 'RUNNING', 'RETRY_SCHEDULED', 'COMPLETED', 'FAILED', 'CANCELLED'))
);

CREATE UNIQUE INDEX "BackgroundJob_deduplicationKey_active_key"
  ON "BackgroundJob"("deduplicationKey")
  WHERE "deduplicationKey" IS NOT NULL
    AND "status" IN ('QUEUED', 'RUNNING', 'RETRY_SCHEDULED');

CREATE INDEX "BackgroundJob_claim_idx"
  ON "BackgroundJob"("queue", "status", "availableAt", "priority", "createdAt");

CREATE INDEX "BackgroundJob_type_status_idx"
  ON "BackgroundJob"("type", "status", "createdAt");

CREATE INDEX "BackgroundJob_locked_idx"
  ON "BackgroundJob"("status", "lockedAt");
