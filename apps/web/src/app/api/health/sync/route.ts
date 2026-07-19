import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!process.env.FOOD_HEALTH_SYNC_TOKEN || token !== process.env.FOOD_HEALTH_SYNC_TOKEN) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const payload: unknown = await request.json();
  return NextResponse.json({ accepted: true, receivedAt: new Date().toISOString(), payload });
}
