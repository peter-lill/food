CREATE TABLE IF NOT EXISTS "HealthConnectPairing" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "pairingUri" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HealthConnectPairing_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "HealthConnectPairing_code_key" ON "HealthConnectPairing"("code");
CREATE INDEX IF NOT EXISTS "HealthConnectPairing_userId_idx" ON "HealthConnectPairing"("userId");
CREATE INDEX IF NOT EXISTS "HealthConnectPairing_expiresAt_idx" ON "HealthConnectPairing"("expiresAt");

CREATE TABLE IF NOT EXISTS "HealthConnectDevice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "deviceName" TEXT NOT NULL,
    "pairedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    CONSTRAINT "HealthConnectDevice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "HealthConnectDevice_tokenHash_key" ON "HealthConnectDevice"("tokenHash");
CREATE INDEX IF NOT EXISTS "HealthConnectDevice_userId_idx" ON "HealthConnectDevice"("userId");
CREATE INDEX IF NOT EXISTS "HealthConnectDevice_expiresAt_idx" ON "HealthConnectDevice"("expiresAt");

DO $$ BEGIN
    ALTER TABLE "HealthConnectPairing"
      ADD CONSTRAINT "HealthConnectPairing_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "user"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "HealthConnectDevice"
      ADD CONSTRAINT "HealthConnectDevice_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "user"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
