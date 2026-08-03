import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-session";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type HealthConnectDeviceRow = {
  id: string;
  deviceName: string;
  pairedAt: Date;
  lastSyncedAt: Date | null;
  expiresAt: Date;
  revokedAt: Date | null;
};

export async function GET() {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in to manage linked devices." }, { status: 401 });
  }

  const devices = await prisma.$queryRaw<HealthConnectDeviceRow[]>`
    SELECT "id", "deviceName", "pairedAt", "lastSyncedAt", "expiresAt", "revokedAt"
    FROM "HealthConnectDevice"
    WHERE "userId" = ${session.user.id}
    ORDER BY "pairedAt" DESC
  `;

  return NextResponse.json(
    {
      devices: devices.map((device) => ({
        id: device.id,
        deviceName: device.deviceName,
        pairedAt: device.pairedAt.toISOString(),
        lastSyncedAt: device.lastSyncedAt?.toISOString() ?? null,
        expiresAt: device.expiresAt.toISOString(),
        revokedAt: device.revokedAt?.toISOString() ?? null,
        active: device.revokedAt === null && device.expiresAt.getTime() > Date.now(),
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function DELETE(request: Request) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in to manage linked devices." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "A device id is required." }, { status: 400 });
  }

  const deviceId = body && typeof body === "object" && typeof (body as { deviceId?: unknown }).deviceId === "string"
    ? (body as { deviceId: string }).deviceId.trim()
    : "";

  if (!deviceId) {
    return NextResponse.json({ error: "A device id is required." }, { status: 400 });
  }

  const changed = await prisma.$executeRaw`
    UPDATE "HealthConnectDevice"
    SET "revokedAt" = NOW()
    WHERE "id" = ${deviceId}
      AND "userId" = ${session.user.id}
      AND "revokedAt" IS NULL
  `;

  if (changed !== 1) {
    return NextResponse.json({ error: "The device was not found or is already disconnected." }, { status: 404 });
  }

  return NextResponse.json({ revoked: true }, { headers: { "Cache-Control": "no-store" } });
}
