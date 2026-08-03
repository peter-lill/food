import { createHash, randomBytes, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function normaliseCode(value: unknown) {
  return typeof value === "string" ? value.replace(/[^a-fA-F0-9]/g, "").toUpperCase() : "";
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const code = normaliseCode(body.code);
  const deviceName = typeof body.deviceName === "string" && body.deviceName.trim()
    ? body.deviceName.trim().slice(0, 80)
    : "Android device";

  if (code.length !== 10) {
    return NextResponse.json({ error: "Enter the 10-character pairing code." }, { status: 400 });
  }

  const candidates = await prisma.verification.findMany({
    where: {
      identifier: { startsWith: "health-connect-pairing-user:" },
      expiresAt: { gt: new Date() },
    },
  });

  const pairing = candidates.find((candidate) => {
    try {
      return JSON.parse(candidate.value).code === code;
    } catch {
      return false;
    }
  });

  if (!pairing) {
    return NextResponse.json({ error: "That pairing code is invalid or has expired." }, { status: 404 });
  }

  const pairingData = JSON.parse(pairing.value) as { userId: string };
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60_000);

  await prisma.$transaction([
    prisma.verification.delete({ where: { id: pairing.id } }),
    prisma.verification.create({
      data: {
        id: randomUUID(),
        identifier: `health-connect-device:${tokenHash}`,
        value: JSON.stringify({ userId: pairingData.userId, deviceName }),
        expiresAt,
      },
    }),
  ]);

  return NextResponse.json({
    token,
    expiresAt: expiresAt.toISOString(),
    uploadEndpoint: `${new URL(request.url).origin}/api/health-connect/sync`,
  });
}
