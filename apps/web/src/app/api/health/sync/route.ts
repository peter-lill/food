import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { saveHealthSummary } from "@/lib/health/health.repository";
import { parseHealthSyncPayload } from "@/lib/health/health.validation";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!token) {
    return NextResponse.json({ error: "Missing device token." }, { status: 401 });
  }

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const device = await prisma.verification.findFirst({
    where: {
      identifier: `health-connect-device:${tokenHash}`,
      expiresAt: { gt: new Date() },
    },
  });

  if (!device) {
    return NextResponse.json({ error: "Device token is invalid or expired." }, { status: 401 });
  }

  let userId = "";
  try {
    const data = JSON.parse(device.value) as { userId?: unknown };
    userId = typeof data.userId === "string" ? data.userId : "";
  } catch {
    userId = "";
  }

  if (!userId) {
    return NextResponse.json({ error: "Paired device is not linked to a user." }, { status: 401 });
  }

  try {
    const payload = parseHealthSyncPayload(await request.json());
    const saved = await saveHealthSummary(payload, userId);

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
