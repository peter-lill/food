import { NextRequest, NextResponse } from "next/server";
import { saveHealthSummary } from "@/lib/health/health.repository";
import { parseHealthSyncPayload } from "@/lib/health/health.validation";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const configuredToken = process.env.FOOD_HEALTH_SYNC_TOKEN;
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (!configuredToken) {
    return NextResponse.json(
      { error: "FOOD_HEALTH_SYNC_TOKEN is not configured." },
      { status: 503 },
    );
  }

  if (token !== configuredToken) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  try {
    const payload = parseHealthSyncPayload(await request.json());
    const saved = await saveHealthSummary(payload);

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
