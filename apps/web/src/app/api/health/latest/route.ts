import { NextResponse } from "next/server";
import { getLatestHealthSummary } from "@/lib/health/health.repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const summary = await getLatestHealthSummary();
  return NextResponse.json({ summary });
}
