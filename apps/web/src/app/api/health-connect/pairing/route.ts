import { randomBytes, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-session";
import { prisma } from "@/lib/prisma";

const pairingLifetimeMinutes = 10;

function createPairingCode() {
  return randomBytes(5).toString("hex").toUpperCase();
}

export async function POST(request: Request) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in to pair a device." }, { status: 401 });
  }

  const code = createPairingCode();
  const expiresAt = new Date(Date.now() + pairingLifetimeMinutes * 60_000);
  const origin = new URL(request.url).origin;
  const pairingUri = `food://health-connect/pair?code=${encodeURIComponent(code)}&server=${encodeURIComponent(origin)}`;

  await prisma.$transaction([
    prisma.verification.deleteMany({
      where: { identifier: `health-connect-pairing-user:${session.user.id}` },
    }),
    prisma.verification.create({
      data: {
        id: randomUUID(),
        identifier: `health-connect-pairing-user:${session.user.id}`,
        value: JSON.stringify({ code, userId: session.user.id, pairingUri }),
        expiresAt,
      },
    }),
  ]);

  return NextResponse.json({ code, expiresAt: expiresAt.toISOString(), pairingUri });
}
