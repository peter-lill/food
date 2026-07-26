import { randomBytes, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-session";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const pairingLifetimeMinutes = 10;

function createPairingCode() {
  return randomBytes(5).toString("hex").toUpperCase();
}

export async function POST(request: Request) {
  try {
    const session = await getAuthSession();
    if (!session) {
      return NextResponse.json(
        { error: "Sign in to pair a device." },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }

    const code = createPairingCode();
    const expiresAt = new Date(Date.now() + pairingLifetimeMinutes * 60_000);
    const origin = new URL(request.url).origin;
    const pairingUri = `food://health-connect/pair?code=${encodeURIComponent(code)}&server=${encodeURIComponent(origin)}`;
    const id = randomUUID();

    await prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`
        DELETE FROM "HealthConnectPairing"
        WHERE "userId" = ${session.user.id}
          AND "consumedAt" IS NULL
      `;
      await transaction.$executeRaw`
        INSERT INTO "HealthConnectPairing"
          ("id", "userId", "code", "pairingUri", "expiresAt", "createdAt")
        VALUES
          (${id}, ${session.user.id}, ${code}, ${pairingUri}, ${expiresAt}, NOW())
      `;
    });

    return NextResponse.json(
      { code, expiresAt: expiresAt.toISOString(), pairingUri },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Health Connect pairing code generation failed", error);
    return NextResponse.json(
      {
        error: error instanceof Error
          ? `Unable to generate a pairing code: ${error.message}`
          : "Unable to generate a pairing code.",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
