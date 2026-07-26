"use server";

import { randomBytes, randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { getAuthSession } from "@/lib/auth-session";
import { prisma } from "@/lib/prisma";

const pairingLifetimeMinutes = 10;

export type PairingActionState = {
  status: "idle" | "success" | "error";
  message: string;
  code?: string;
  expiresAt?: string;
  pairingUri?: string;
};

export const initialPairingActionState: PairingActionState = {
  status: "idle",
  message: "",
};

function createPairingCode() {
  return randomBytes(5).toString("hex").toUpperCase();
}

async function requestOrigin() {
  const requestHeaders = await headers();
  const forwardedHost = requestHeaders.get("x-forwarded-host");
  const host = forwardedHost ?? requestHeaders.get("host");
  const forwardedProtocol = requestHeaders.get("x-forwarded-proto");
  const protocol = forwardedProtocol ?? (host?.includes("localhost") ? "http" : "https");

  if (host) return `${protocol}://${host}`;

  return process.env.BETTER_AUTH_URL?.replace(/\/$/, "")
    ?? process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "")
    ?? "https://food.coffeehq.coffee";
}

export async function generateHealthConnectPairingCode(
  _previousState: PairingActionState,
): Promise<PairingActionState> {
  try {
    const session = await getAuthSession();
    if (!session) {
      return { status: "error", message: "Your session has expired. Sign in again before pairing a phone." };
    }

    const code = createPairingCode();
    const expiresAt = new Date(Date.now() + pairingLifetimeMinutes * 60_000);
    const origin = await requestOrigin();
    const pairingUri = `food://health-connect/pair?code=${encodeURIComponent(code)}&server=${encodeURIComponent(origin)}`;
    const identifier = `health-connect-pairing-user:${session.user.id}`;

    await prisma.$transaction([
      prisma.verification.deleteMany({ where: { identifier } }),
      prisma.verification.create({
        data: {
          id: randomUUID(),
          identifier,
          value: JSON.stringify({
            code,
            userId: session.user.id,
            pairingUri,
            createdAt: new Date().toISOString(),
          }),
          expiresAt,
        },
      }),
    ]);

    return {
      status: "success",
      message: "Pairing code generated.",
      code,
      expiresAt: expiresAt.toISOString(),
      pairingUri,
    };
  } catch (error) {
    console.error("Health Connect pairing server action failed", error);
    return {
      status: "error",
      message: error instanceof Error
        ? `Unable to generate a pairing code: ${error.message}`
        : "Unable to generate a pairing code.",
    };
  }
}
