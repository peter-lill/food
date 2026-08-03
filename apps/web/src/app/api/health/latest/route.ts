import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-session";
import { isHealthConnectPaired } from "@/lib/health/health-pairing";
import { getLatestHealthSummary } from "@/lib/health/health.repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in to view health data." }, { status: 401 });
  }

  const paired = await isHealthConnectPaired(session.user.id).catch(() => false);
  if (!paired) {
    return NextResponse.json({ error: "Pair an Android device to view health data." }, { status: 404 });
  }

  const summary = await getLatestHealthSummary(session.user.id);
  return NextResponse.json({ summary });
}
