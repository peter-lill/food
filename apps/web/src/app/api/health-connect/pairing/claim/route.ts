import { createHash, randomBytes, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const deviceTokenLifetimeDays = 3650;

type PendingPairing = {
  id: string;
  userId: string;
};

function normaliseCode(value: unknown) {
  return typeof value === "string"
    ? value.replace(/\s+/g, "").trim().toUpperCase()
    : "";
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "A pairing code is required." }, { status: 400 });
  }

  const data = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const code = normaliseCode(data.code);
  const deviceName = typeof data.deviceName === "string" && data.deviceName.trim()
    ? data.deviceName.trim().slice(0, 120)
    : "Android device";

  if (!code) {
    return NextResponse.json({ error: "A pairing code is required." }, { status: 400 });
  }

  const pairings = await prisma.$queryRaw<PendingPairing[]>`
    SELECT "id", "userId"
    FROM "HealthConnectPairing"
    WHERE "code" = ${code}
      AND "expiresAt" > NOW()
      AND "consumedAt" IS NULL
    LIMIT 1
  `;
  const pairing = pairings[0];

  if (!pairing) {
    return NextResponse.json(
      { error: "The pairing code is invalid, expired or has already been used." },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  const deviceToken = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(deviceToken).digest("hex");
  const pairedAt = new Date();
  const expiresAt = new Date(pairedAt.getTime() + deviceTokenLifetimeDays * 24 * 60 * 60 * 1000);
  const origin = new URL(request.url).origin;
  const deviceId = randomUUID();

  await prisma.$transaction(async (transaction) => {
    const consumed = await transaction.$executeRaw`
      UPDATE "HealthConnectPairing"
      SET "consumedAt" = ${pairedAt}
      WHERE "id" = ${pairing.id}
        AND "consumedAt" IS NULL
    `;
    if (consumed !== 1) throw new Error("The pairing code has already been used.");

    await transaction.$executeRaw`
      INSERT INTO "HealthConnectDevice"
        ("id", "userId", "tokenHash", "deviceName", "pairedAt", "expiresAt")
      VALUES
        (${deviceId}, ${pairing.userId}, ${tokenHash}, ${deviceName}, ${pairedAt}, ${expiresAt})
    `;
  });

  return NextResponse.json(
    {
      deviceToken,
      deviceName,
      pairedAt: pairedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      syncUrl: `${origin}/api/health/sync`,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
