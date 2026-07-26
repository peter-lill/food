import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const deviceTokenLifetimeDays = 3650;

function normaliseCode(value: unknown) {
  return typeof value === "string"
    ? value.replace(/\s+/g, "").trim().toUpperCase()
    : "";
}

function codesMatch(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
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

  const pendingPairings = await prisma.verification.findMany({
    where: {
      identifier: { startsWith: "health-connect-pairing-user:" },
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const pairing = pendingPairings.find((entry) => {
    try {
      const value = JSON.parse(entry.value) as { code?: unknown };
      return typeof value.code === "string" && codesMatch(code, normaliseCode(value.code));
    } catch {
      return false;
    }
  });

  if (!pairing) {
    return NextResponse.json(
      { error: "The pairing code is invalid, expired or has already been used." },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  let userId = "";
  try {
    const value = JSON.parse(pairing.value) as { userId?: unknown };
    userId = typeof value.userId === "string" ? value.userId : "";
  } catch {
    userId = "";
  }

  if (!userId) {
    return NextResponse.json({ error: "The pairing code is not linked to an account." }, { status: 422 });
  }

  const deviceToken = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(deviceToken).digest("hex");
  const pairedAt = new Date();
  const expiresAt = new Date(pairedAt.getTime() + deviceTokenLifetimeDays * 24 * 60 * 60 * 1000);
  const origin = new URL(request.url).origin;

  await prisma.$transaction([
    prisma.verification.delete({ where: { id: pairing.id } }),
    prisma.verification.create({
      data: {
        id: randomUUID(),
        identifier: `health-connect-device:${tokenHash}`,
        value: JSON.stringify({
          userId,
          deviceName,
          pairedAt: pairedAt.toISOString(),
        }),
        expiresAt,
      },
    }),
  ]);

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
