import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { saveHealthSummary } from "@/lib/health/health.repository";
import { parseHealthSyncPayload } from "@/lib/health/health.validation";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type PairedDevice = {
  id: string;
  userId: string;
};

export async function POST(request: NextRequest) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!token) {
    return NextResponse.json({ error: "Missing device token." }, { status: 401 });
  }

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const devices = await prisma.$queryRaw<PairedDevice[]>`
    SELECT "id", "userId"
    FROM "HealthConnectDevice"
    WHERE "tokenHash" = ${tokenHash}
      AND "expiresAt" > NOW()
      AND "revokedAt" IS NULL
    LIMIT 1
  `;
  const device = devices[0];

  if (!device) {
    return NextResponse.json({ error: "Device token is invalid or expired." }, { status: 401 });
  }

  try {
    const payload = parseHealthSyncPayload(await request.json());
    const saved = await saveHealthSummary(payload, device.userId);

    await prisma.$executeRaw`
      UPDATE "HealthConnectDevice"
      SET "lastSyncedAt" = NOW()
      WHERE "id" = ${device.id}
    `;

    return NextResponse.json({
      accepted: true,
      receivedAt: new Date().toISOString(),
      recordedAt: saved.recordedAt.toISOString(),
      metricsSaved: saved.count,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid payload.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
