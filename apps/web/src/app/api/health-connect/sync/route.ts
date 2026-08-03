import { createHash } from "node:crypto";
import { HealthMetricType } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const validTypes = new Set(Object.values(HealthMetricType));

type IncomingMetric = {
  type?: unknown;
  value?: unknown;
  recordedAt?: unknown;
  source?: unknown;
};

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
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

  const body = await request.json().catch(() => ({}));
  const metrics = Array.isArray(body.metrics) ? body.metrics as IncomingMetric[] : [];
  if (metrics.length === 0 || metrics.length > 500) {
    return NextResponse.json({ error: "Provide between 1 and 500 health metrics." }, { status: 400 });
  }

  try {
    const parsed = metrics.map((metric) => {
      const type = typeof metric.type === "string" ? metric.type as HealthMetricType : null;
      const value = typeof metric.value === "number" ? metric.value : Number(metric.value);
      const recordedAt = typeof metric.recordedAt === "string" ? new Date(metric.recordedAt) : new Date(NaN);
      const rawSource = typeof metric.source === "string" ? metric.source.slice(0, 100) : "Android Health Connect";
      const source = `user:${userId}:${rawSource}`;

      if (!type || !validTypes.has(type) || !Number.isFinite(value) || Number.isNaN(recordedAt.getTime())) {
        throw new Error("One or more metrics are invalid.");
      }

      return { type, value, recordedAt, source };
    });

    const result = await prisma.healthMetric.createMany({ data: parsed });
    return NextResponse.json({ accepted: result.count });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to store health metrics.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
